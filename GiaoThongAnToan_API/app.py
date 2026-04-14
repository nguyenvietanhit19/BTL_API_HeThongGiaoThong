from flask import Flask
from dotenv import load_dotenv
import os

# 1. BẮT BUỘC NẠP .ENV TRƯỚC TIÊN!
load_dotenv()

# 2. Sau đó mới import các route (vì các route này có gọi middleware/db)
from routes.auth import auth_bp
from routes.upload import upload_bp
from routes.report import bao_cao_bp

app = Flask(__name__)

app.register_blueprint(auth_bp, url_prefix='/auth')
app.register_blueprint(upload_bp, url_prefix='')
app.register_blueprint(bao_cao_bp, url_prefix='/bao-cao')

if __name__ == '__main__':
    app.run(debug=True)