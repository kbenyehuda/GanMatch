// One-time: give the generated WhatsApp-writer users (whatsapp-<hash>@givemytime.local)
// a random password and drop `whatsapp_name` from their user metadata.
// They used to get the guessable password `WA!<email>`.
//
// Count only:  node scripts/maintenance/reset_whatsapp_contact_users.mjs
// Apply:       node scripts/maintenance/reset_whatsapp_contact_users.mjs --apply --backup=<path outside the repo>
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.

import { readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const apply = process.argv.includes("--apply");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Pages of 100: bigger pages time out on this project.
const targets = [];
for (let page = 1; page <= 100; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw new Error(`listUsers page ${page}: ${error.message}`);
  const users = data?.users ?? [];
  targets.push(...users.filter(u => /^whatsapp-[0-9a-f]{16}@givemytime\.local$/.test(u.email ?? "")));
  if (users.length < 100) break;
}

const withName = targets.filter(u => u.user_metadata?.whatsapp_name != null).length;
console.log(`${targets.length} WhatsApp-writer users, ${withName} with whatsapp_name in metadata.`);
if (!apply) { console.log("Count only. Run with --apply to reset them."); process.exit(0); }

// Keep a private copy of who is who before the names are removed. Never inside the repo.
const backupArg = process.argv.find(a => a.startsWith("--backup="));
if (!backupArg) throw new Error("--apply needs --backup=<path outside the repo>");
const backupPath = backupArg.slice("--backup=".length);
const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
writeFileSync(backupPath, "﻿user_id,email,whatsapp_name\n" +
  targets.map(u => [u.id, u.email, u.user_metadata?.whatsapp_name].map(csv).join(",")).join("\n") + "\n");
console.log(`Backup: ${backupPath}`);

let done = 0, failed = 0;
for (const u of targets) {
  const { error } = await admin.auth.admin.updateUserById(u.id, {
    password: randomBytes(32).toString("base64url"),
    user_metadata: { whatsapp_name: null },  // null removes the key
  });
  if (error) { failed++; console.error(`${u.id}: ${error.message}`); } else done++;
}
console.log(`Reset ${done}, failed ${failed}.`);
