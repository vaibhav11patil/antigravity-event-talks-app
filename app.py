import os
import re
import time
import requests
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

# In-memory cache to store parsed feed
cache = {
    "data": None,
    "last_fetched": 0
}
CACHE_DURATION = 600  # 10 minutes cache

def parse_release_notes(content_html):
    if not content_html:
        return []
    
    # If no <h3> tag, treat the entire block as one update
    if '<h3>' not in content_html:
        return [{'type': 'Update', 'content': content_html.strip()}]
    
    # Segment by <h3>Type</h3> blocks
    pattern = re.compile(r'<h3>(.*?)</h3>(.*?)(?=<h3>|$)', re.DOTALL)
    matches = pattern.findall(content_html)
    
    notes = []
    for note_type, note_content in matches:
        notes.append({
            'type': note_type.strip(),
            'content': note_content.strip()
        })
    return notes

def fetch_and_parse_feed():
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    response = requests.get(FEED_URL, headers=headers, timeout=15)
    response.raise_for_status()
    
    # Parse XML
    root = ET.fromstring(response.content)
    ns = {'atom': 'http://www.w3.org/2005/Atom'}
    
    entries = []
    for entry_node in root.findall('atom:entry', ns):
        title = entry_node.find('atom:title', ns)
        title_text = title.text if title is not None else "Unknown Date"
        
        updated = entry_node.find('atom:updated', ns)
        updated_text = updated.text if updated is not None else ""
        
        link = entry_node.find('atom:link[@rel="alternate"]', ns)
        link_href = link.attrib.get('href', '') if link is not None else ""
        
        content = entry_node.find('atom:content', ns)
        content_html = content.text if content is not None else ""
        
        parsed_notes = parse_release_notes(content_html)
        
        entries.append({
            'date': title_text,
            'updated': updated_text,
            'link': link_href,
            'updates': parsed_notes
        })
        
    return entries

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/release-notes')
def get_release_notes():
    bypass_cache = request.args.get('refresh', 'false').lower() == 'true'
    now = time.time()
    
    if bypass_cache or not cache["data"] or (now - cache["last_fetched"] > CACHE_DURATION):
        try:
            data = fetch_and_parse_feed()
            cache["data"] = data
            cache["last_fetched"] = now
            return jsonify({
                "status": "success",
                "source": "network",
                "data": data
            })
        except Exception as e:
            # Fallback to cache if request fails but cache exists
            if cache["data"]:
                return jsonify({
                    "status": "warning",
                    "message": f"Could not fetch fresh data: {str(e)}. Displaying cached feed.",
                    "source": "cache",
                    "data": cache["data"]
                })
            return jsonify({
                "status": "error",
                "message": f"Failed to retrieve release notes: {str(e)}"
            }), 500
            
    return jsonify({
        "status": "success",
        "source": "cache",
        "data": cache["data"]
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
