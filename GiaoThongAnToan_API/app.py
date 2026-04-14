from flask import Flask
from routes.auth import auth_bp
from routes.upload import upload_bp
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

app.register_blueprint(auth_bp, url_prefix='/auth')
app.register_blueprint(upload_bp, url_prefix='')  # ← thêm dòng này

if __name__ == '__main__':
    app.run(debug=True)