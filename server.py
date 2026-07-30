import http.server
import socketserver
import json
import os

PORT = 8000
DATA_FILE = os.path.join(os.path.dirname(__file__), 'attendance_data.json')

DEFAULT_DATA = {
    "users": [
        {"id": "u1", "username": "admin", "password": "admin123", "role": "admin", "name": "System Administrator"},
        {"id": "u2", "username": "incharge1", "password": "user123", "role": "incharge", "name": "Student Incharge 1"}
    ],
    "departments": [
        "Computer Science",
        "Information Technology",
        "Electronics & Comm",
        "Commerce",
        "Mathematics"
    ],
    "sections": ["Section A", "Section B", "Section C", "Section D"],
    "teams": ["Team Alpha", "Team Beta", "Team Gamma", "Team Delta"],
    "students": [
        {
            "id": "s1",
            "name": "John Doe",
            "rollNumber": "21CS01",
            "registerNumber": "910021104001",
            "mobile": "9876543210",
            "department": "Aided",
            "deptName": "Computer Science",
            "section": "Section A",
            "teamId": "Team Alpha"
        },
        {
            "id": "s2",
            "name": "Jane Smith",
            "rollNumber": "21CS02",
            "registerNumber": "910021104002",
            "mobile": "9876543211",
            "department": "Self-Finance",
            "deptName": "Information Technology",
            "section": "Section B",
            "teamId": "Team Alpha"
        },
        {
            "id": "s3",
            "name": "Robert Brown",
            "rollNumber": "21CS03",
            "registerNumber": "910021104003",
            "mobile": "9876543212",
            "department": "Aided",
            "deptName": "Commerce",
            "section": "Section A",
            "teamId": "Team Beta"
        },
        {
            "id": "s4",
            "name": "Emily Davis",
            "rollNumber": "21CS04",
            "registerNumber": "910021104004",
            "mobile": "9876543213",
            "department": "Self-Finance",
            "deptName": "Mathematics",
            "section": "Section C",
            "teamId": "Team Gamma"
        }
    ],
    "attendance": []
}

def load_data():
    if not os.path.exists(DATA_FILE):
        save_data(DEFAULT_DATA)
        return DEFAULT_DATA
    try:
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading data file: {e}")
        return DEFAULT_DATA

def save_data(data):
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

class AttendanceHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path == '/api/data':
            data = load_data()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode('utf-8'))
            return
        return super().do_GET()

    def do_POST(self):
        if self.path == '/api/data':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode('utf-8'))
                save_data(data)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": "Data saved"}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return
        self.send_response(404)
        self.end_headers()

if __name__ == '__main__':
    load_data()
    web_dir = os.path.dirname(__file__)
    os.chdir(web_dir)
    handler = AttendanceHTTPRequestHandler
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"==================================================")
        print(f" Attendance Management Server is running!")
        print(f" Access locally at: http://localhost:{PORT}")
        print(f" Access over LAN at: http://<your-ip-address>:{PORT}")
        print(f"==================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
