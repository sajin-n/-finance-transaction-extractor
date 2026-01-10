#!/bin/bash
echo "===== Testing All Backend Endpoints ====="
echo ""

BASE_URL="http://localhost:3001"

echo "1️⃣ Testing Health Check..."
curl -s -w "\nStatus: %{http_code}\n" $BASE_URL/health
echo ""

echo "2️⃣ Testing Sign Up..."
SIGNUP_RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST $BASE_URL/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"password123","name":"Test User"}')
echo "$SIGNUP_RESPONSE"
echo ""

echo "3️⃣ Testing Sign In..."
SIGNIN_RESPONSE=$(curl -s -i -X POST $BASE_URL/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"password123"}')
echo "$SIGNIN_RESPONSE"

# Extract cookie
COOKIE=$(echo "$SIGNIN_RESPONSE" | grep -i "set-cookie" | head -1 | cut -d' ' -f2-)
echo "Cookie: $COOKIE"
echo ""

echo "4️⃣ Testing Session Endpoint..."
curl -s -w "\nStatus: %{http_code}\n" -H "Cookie: $COOKIE" $BASE_URL/api/auth/session
echo ""

echo "5️⃣ Testing Transaction Extract (Protected)..."
curl -s -w "\nStatus: %{http_code}\n" -X POST $BASE_URL/api/transactions/extract \
  -H "Cookie: $COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"text":"Date: 11 Dec 2025\nDescription: STARBUCKS COFFEE MUMBAI\nAmount: -420.00\nBalance after transaction: 18420.50"}'
echo ""

echo "6️⃣ Testing Transactions List (Protected)..."
curl -s -w "\nStatus: %{http_code}\n" -H "Cookie: $COOKIE" $BASE_URL/api/transactions
echo ""
