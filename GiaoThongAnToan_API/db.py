import pyodbc
from dotenv import load_dotenv
import os

load_dotenv()

def get_db():
    conn_str = (
        "DRIVER={ODBC Driver 17 for SQL Server};"
        "SERVER=DESKTOP-S8OVI3U;"  # Dùng chính xác tên từ SSMS
        "DATABASE=giao_thong_cong_dong2;"
        "Trusted_Connection=yes;"
        "Encrypt=no;"
        "Connection Timeout=30;"
    )
    return pyodbc.connect(conn_str)