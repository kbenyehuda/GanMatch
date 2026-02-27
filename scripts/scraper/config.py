"""
Scraper configuration: URLs and selectors for daycare sources.
Adjust selectors after inspecting actual page structure.
"""

SOURCES = {
    "tel_aviv": {
        "url": "https://www.tel-aviv.gov.il/Residents/Education/Pages/daycare.aspx",
        "alt_urls": [
            "https://www.tel-aviv.gov.il/Residents/Education/Pages/KindergartenList.aspx",
            "https://www.tel-aviv.gov.il/Residents/Education/Pages/kindergardenList1.aspx",
        ],
        "city": "תל אביב",
        "city_en": "Tel Aviv",
    },
    "givatayim": {
        "url": "https://www.givatayim.muni.il/1385/",
        "city": "גבעתיים",
        "city_en": "Givatayim",
        # Google My Maps with daycare locations (export to KML → import_from_kml.py)
        "map_url": "https://www.google.com/maps/d/u/0/viewer?mid=1Fu8muzSdopFv2SGzAZMb_xkd1Vp1x2A&ll=32.07056201003119%2C34.81030239999999&z=15",
    },
}

