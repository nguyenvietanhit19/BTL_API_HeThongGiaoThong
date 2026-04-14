import pyodbc
from dotenv import load_dotenv
import os

load_dotenv()


def get_db():
    chuoi_ket_noi = (
    "Driver={ODBC Driver 17 for SQL Server};"
    "Server=DESKTOP-90IHRHM;" 
    "Database=giao_thong_cong_dong2;"
    "Trusted_Connection=yes;"
)
    conn = pyodbc.connect(chuoi_ket_noi)
    return conn