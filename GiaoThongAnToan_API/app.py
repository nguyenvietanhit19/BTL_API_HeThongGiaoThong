import os
from datetime import datetime, date
from dotenv import load_dotenv
from flask import Flask, send_from_directory
from flask.json.provider import DefaultJSONProvider
from flask_cors import CORS

load_dotenv()

class VNJSONProvider(DefaultJSONProvider):
    def default(self, o):
        if isinstance(o, datetime):
            return o.strftime('%Y-%m-%dT%H:%M:%S+07:00')
        if isinstance(o, date):
            return o.strftime('%Y-%m-%d')
        return super().default(o)

app = Flask(__name__)
app.json_provider_class = VNJSONProvider
app.json = VNJSONProvider(app)
app.config["JSON_AS_ASCII"] = False
app.json.ensure_ascii = False
CORS(app, resources={r"/*": {"origins": "*"}})

from routes.admin import admin_bp
from routes.admin_get import admin_get_bp
from routes.auth import auth_bp
from routes.nhan_vien import nhan_vien_bp
from routes.quan_ly_tai_khoan import quan_ly_bp
from routes.quen_mat_khau import qmk_bp
from routes.report import bao_cao_bp
from routes.reports import reports_bp
from routes.upload import upload_bp

app.register_blueprint(auth_bp, url_prefix='/auth')
app.register_blueprint(qmk_bp, url_prefix='/auth')

app.register_blueprint(bao_cao_bp, url_prefix='/bao-cao')
app.register_blueprint(upload_bp, url_prefix='')

app.register_blueprint(reports_bp, url_prefix='/api/Reports')
app.register_blueprint(nhan_vien_bp, url_prefix='/nhan-vien')

app.register_blueprint(admin_bp, url_prefix='/admin')
app.register_blueprint(admin_get_bp, url_prefix='/admin_get')
app.register_blueprint(quan_ly_bp, url_prefix='/admin')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, '..', 'FrontEnd')

@app.route('/')
def index():
    return send_from_directory(os.path.join(FRONTEND_DIR, 'html', 'dang_nhap'), 'dang_nhap.html')

@app.route('/ban-do')
def ban_do():
    return send_from_directory(os.path.join(FRONTEND_DIR, 'html', 'user'), 'ban_do2.html')

@app.route('/FrontEnd/<path:path>')
def frontend(path):
    return send_from_directory(FRONTEND_DIR, path)

if __name__ == '__main__':
    print("Danh sách các API hiện có:")
    print(app.url_map)

    port = int(os.getenv('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
