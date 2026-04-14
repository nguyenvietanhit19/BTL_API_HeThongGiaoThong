import pyodbc
from dotenv import load_dotenv
import os

load_dotenv()

def get_db():
    conn = pyodbc.connect(
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={os.getenv('DB_SERVER')};"
        f"DATABASE={os.getenv('DB_NAME')};"
        f"Trusted_Connection=yes;"
    )
    return conn