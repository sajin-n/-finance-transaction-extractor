import requests
import json
import time
import subprocess
import sys

# Start server
print("Starting server...")
proc = subprocess.Popen(
    ["npm", "run", "dev"],
    cwd=r"C:\Users\sajin\OneDrive\Desktop\vessify-assignment-FTE\backend",
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE
)

# Wait for server to start
time.sleep(10)

BASE_URL = "http://localhost:3001"

try:
    print("\n===== TESTING ALL ENDPOINTS =====\n")

    # 1. Health check
    print("✅ 1. Health Check")
    resp = requests.get(f"{BASE_URL}/health")
    print(f"   Status: {resp.status_code}, Response: {resp.text}\n")

    # 2. Sign Up
    print("✅ 2. Sign Up")
    signup_data = {
        "email": "testuser@example.com",
        "password": "password123",
        "name": "Test User"
    }
    resp = requests.post(f"{BASE_URL}/api/auth/sign-up/email", json=signup_data)
    print(f"   Status: {resp.status_code}, Response: {resp.text[:200]}\n")

    # 3. Sign In
    print("✅ 3. Sign In")
    signin_data = {
        "email": "testuser@example.com",
        "password": "password123"
    }
    resp = requests.post(f"{BASE_URL}/api/auth/sign-in/email", json=signin_data)
    print(f"   Status: {resp.status_code}")
    print(f"   Headers: {dict(resp.headers)}\n")
    
    cookie = resp.cookies
    print(f"   Cookies: {cookie}\n")

    # 4. Session
    print("✅ 4. Get Session")
    resp = requests.get(f"{BASE_URL}/api/auth/session", cookies=cookie)
    print(f"   Status: {resp.status_code}, Response: {resp.text[:200]}\n")

    # 5. Extract Transaction
    print("✅ 5. Extract Transaction (Protected)")
    tx_data = {
        "text": "Date: 11 Dec 2025\nDescription: STARBUCKS COFFEE MUMBAI\nAmount: -420.00\nBalance after transaction: 18420.50"
    }
    resp = requests.post(f"{BASE_URL}/api/transactions/extract", json=tx_data, cookies=cookie)
    print(f"   Status: {resp.status_code}, Response: {resp.text[:200]}\n")

    # 6. List Transactions
    print("✅ 6. List Transactions (Protected)")
    resp = requests.get(f"{BASE_URL}/api/transactions", cookies=cookie)
    print(f"   Status: {resp.status_code}, Response: {resp.text[:200]}\n")

finally:
    print("Stopping server...")
    proc.terminate()
    proc.wait()
