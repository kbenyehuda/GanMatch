import os
from openai import OpenAI

# Create client using API key from environment variable
client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

try:
    response = client.responses.create(
        model="gpt-4.1-mini",
        input="Hello"
    )
    print(response.output_text)
except Exception as e:
    print(type(e))
    print(e)