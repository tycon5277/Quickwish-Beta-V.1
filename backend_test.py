#!/usr/bin/env python3
"""
QuickWish Backend API Testing Suite
Tests all backend endpoints according to the review request
"""

import requests
import json
import uuid
from datetime import datetime, timezone
import subprocess
import sys

# Backend URL from environment
BACKEND_URL = "https://quickwish-1.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

class QuickWishAPITester:
    def __init__(self):
        self.session_token = None
        self.test_user_id = None
        self.results = {
            "public_apis": {},
            "auth_apis": {},
            "protected_apis": {},
            "user_apis": {},
            "errors": []
        }
    
    def log_result(self, category, endpoint, success, details):
        """Log test result"""
        self.results[category][endpoint] = {
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {endpoint}: {details}")
    
    def log_error(self, error):
        """Log error"""
        self.results["errors"].append(error)
        print(f"🚨 ERROR: {error}")
    
    def test_public_apis(self):
        """Test public APIs that don't require authentication"""
        print("\n=== Testing Public APIs ===")
        
        # Test health check
        try:
            response = requests.get(f"{API_BASE}/", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.log_result("public_apis", "GET /", True, f"Status: {response.status_code}, Message: {data.get('message', 'N/A')}")
            else:
                self.log_result("public_apis", "GET /", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("public_apis", "GET /", False, f"Exception: {str(e)}")
        
        # Test health endpoint
        try:
            response = requests.get(f"{API_BASE}/health", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.log_result("public_apis", "GET /health", True, f"Status: {data.get('status', 'N/A')}")
            else:
                self.log_result("public_apis", "GET /health", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("public_apis", "GET /health", False, f"Exception: {str(e)}")
        
        # Test seed data
        try:
            response = requests.post(f"{API_BASE}/seed", timeout=15)
            if response.status_code == 200:
                data = response.json()
                self.log_result("public_apis", "POST /seed", True, f"Message: {data.get('message', 'Success')}")
            else:
                self.log_result("public_apis", "POST /seed", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("public_apis", "POST /seed", False, f"Exception: {str(e)}")
        
        # Test explore posts
        try:
            response = requests.get(f"{API_BASE}/explore", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.log_result("public_apis", "GET /explore", True, f"Found {len(data)} posts")
            else:
                self.log_result("public_apis", "GET /explore", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("public_apis", "GET /explore", False, f"Exception: {str(e)}")
        
        # Test local hub
        try:
            response = requests.get(f"{API_BASE}/localhub", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.log_result("public_apis", "GET /localhub", True, f"Found {len(data)} businesses")
            else:
                self.log_result("public_apis", "GET /localhub", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("public_apis", "GET /localhub", False, f"Exception: {str(e)}")
        
        # Test local hub with category filter
        try:
            response = requests.get(f"{API_BASE}/localhub?category=Home%20Kitchen", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.log_result("public_apis", "GET /localhub?category=Home Kitchen", True, f"Found {len(data)} businesses")
            else:
                self.log_result("public_apis", "GET /localhub?category=Home Kitchen", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("public_apis", "GET /localhub?category=Home Kitchen", False, f"Exception: {str(e)}")
    
    def setup_test_user_session(self):
        """Create test user and session in MongoDB"""
        print("\n=== Setting up Test User and Session ===")
        
        try:
            # Generate test data
            self.test_user_id = 'user_test123'
            self.session_token = 'test_session_abc123'
            
            # MongoDB command to create test user and session
            mongo_command = f"""
            mongosh --eval "
            use('test_database');
            var userId = '{self.test_user_id}';
            var sessionToken = '{self.session_token}';
            
            // Remove existing test data
            db.users.deleteOne({{user_id: userId}});
            db.user_sessions.deleteOne({{session_token: sessionToken}});
            
            // Create test user
            db.users.insertOne({{
              user_id: userId,
              email: 'testuser@example.com',
              name: 'Test User',
              picture: null,
              phone: null,
              addresses: [],
              created_at: new Date()
            }});
            
            // Create test session
            db.user_sessions.insertOne({{
              user_id: userId,
              session_token: sessionToken,
              expires_at: new Date(Date.now() + 7*24*60*60*1000),
              created_at: new Date()
            }});
            
            print('Test user and session created successfully');
            "
            """
            
            result = subprocess.run(mongo_command, shell=True, capture_output=True, text=True, timeout=30)
            
            if result.returncode == 0:
                print(f"✅ Test user created: {self.test_user_id}")
                print(f"✅ Session token: {self.session_token}")
                return True
            else:
                self.log_error(f"MongoDB setup failed: {result.stderr}")
                return False
                
        except Exception as e:
            self.log_error(f"Failed to setup test user: {str(e)}")
            return False
    
    def test_auth_apis(self):
        """Test authentication APIs"""
        print("\n=== Testing Auth APIs ===")
        
        if not self.session_token:
            self.log_result("auth_apis", "Setup", False, "No session token available")
            return
        
        # Test /auth/me with Bearer token
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            response = requests.get(f"{API_BASE}/auth/me", headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("auth_apis", "GET /auth/me", True, f"User: {data.get('name', 'N/A')} ({data.get('email', 'N/A')})")
            else:
                self.log_result("auth_apis", "GET /auth/me", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_result("auth_apis", "GET /auth/me", False, f"Exception: {str(e)}")
        
        # Test unauthorized access
        try:
            response = requests.get(f"{API_BASE}/auth/me", timeout=10)
            if response.status_code == 401:
                self.log_result("auth_apis", "GET /auth/me (no auth)", True, "Correctly rejected unauthorized request")
            else:
                self.log_result("auth_apis", "GET /auth/me (no auth)", False, f"Expected 401, got {response.status_code}")
        except Exception as e:
            self.log_result("auth_apis", "GET /auth/me (no auth)", False, f"Exception: {str(e)}")
    
    def test_protected_apis(self):
        """Test protected APIs that require authentication"""
        print("\n=== Testing Protected APIs ===")
        
        if not self.session_token:
            self.log_result("protected_apis", "Setup", False, "No session token available")
            return
        
        headers = {"Authorization": f"Bearer {self.session_token}", "Content-Type": "application/json"}
        
        # Test create wish
        wish_data = {
            "wish_type": "delivery",
            "title": "Need groceries from market",
            "description": "Need vegetables and fruits",
            "location": {"lat": 12.97, "lng": 77.59, "address": "Sector 5, Block A"},
            "radius_km": 5,
            "remuneration": 100,
            "is_immediate": True
        }
        
        try:
            response = requests.post(f"{API_BASE}/wishes", 
                                   headers=headers, 
                                   json=wish_data, 
                                   timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                wish_id = data.get('wish_id')
                self.log_result("protected_apis", "POST /wishes", True, f"Created wish: {wish_id}")
                
                # Store wish_id for further tests
                self.created_wish_id = wish_id
            else:
                self.log_result("protected_apis", "POST /wishes", False, f"Status: {response.status_code}, Response: {response.text}")
        except Exception as e:
            self.log_result("protected_apis", "POST /wishes", False, f"Exception: {str(e)}")
        
        # Test get wishes
        try:
            response = requests.get(f"{API_BASE}/wishes", headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("protected_apis", "GET /wishes", True, f"Found {len(data)} wishes")
            else:
                self.log_result("protected_apis", "GET /wishes", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("protected_apis", "GET /wishes", False, f"Exception: {str(e)}")
        
        # Test get chat rooms
        try:
            response = requests.get(f"{API_BASE}/chat/rooms", headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("protected_apis", "GET /chat/rooms", True, f"Found {len(data)} chat rooms")
            else:
                self.log_result("protected_apis", "GET /chat/rooms", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("protected_apis", "GET /chat/rooms", False, f"Exception: {str(e)}")
    
    def test_user_apis(self):
        """Test user management APIs"""
        print("\n=== Testing User APIs ===")
        
        if not self.session_token:
            self.log_result("user_apis", "Setup", False, "No session token available")
            return
        
        headers = {"Authorization": f"Bearer {self.session_token}", "Content-Type": "application/json"}
        
        # Test update phone
        phone_data = {"phone": "+911234567890"}
        try:
            response = requests.put(f"{API_BASE}/users/phone", 
                                  headers=headers, 
                                  json=phone_data, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("user_apis", "PUT /users/phone", True, f"Message: {data.get('message', 'Success')}")
            else:
                self.log_result("user_apis", "PUT /users/phone", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("user_apis", "PUT /users/phone", False, f"Exception: {str(e)}")
        
        # Test add address
        address_data = {
            "label": "Home",
            "address": "123 Main St",
            "lat": 12.97,
            "lng": 77.59
        }
        try:
            response = requests.post(f"{API_BASE}/users/addresses", 
                                   headers=headers, 
                                   json=address_data, 
                                   timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("user_apis", "POST /users/addresses", True, f"Message: {data.get('message', 'Success')}")
            else:
                self.log_result("user_apis", "POST /users/addresses", False, f"Status: {response.status_code}")
        except Exception as e:
            self.log_result("user_apis", "POST /users/addresses", False, f"Exception: {str(e)}")
    
    def test_unauthorized_access(self):
        """Test that protected endpoints properly reject unauthorized requests"""
        print("\n=== Testing Unauthorized Access Protection ===")
        
        protected_endpoints = [
            ("GET", "/wishes"),
            ("POST", "/wishes"),
            ("GET", "/chat/rooms"),
            ("PUT", "/users/phone"),
            ("POST", "/users/addresses")
        ]
        
        for method, endpoint in protected_endpoints:
            try:
                if method == "GET":
                    response = requests.get(f"{API_BASE}{endpoint}", timeout=10)
                elif method == "POST":
                    response = requests.post(f"{API_BASE}{endpoint}", json={}, timeout=10)
                elif method == "PUT":
                    response = requests.put(f"{API_BASE}{endpoint}", json={}, timeout=10)
                
                if response.status_code == 401:
                    self.log_result("protected_apis", f"{method} {endpoint} (unauthorized)", True, "Correctly rejected")
                else:
                    self.log_result("protected_apis", f"{method} {endpoint} (unauthorized)", False, f"Expected 401, got {response.status_code}")
            except Exception as e:
                self.log_result("protected_apis", f"{method} {endpoint} (unauthorized)", False, f"Exception: {str(e)}")
    
    def run_all_tests(self):
        """Run all test suites"""
        print("🚀 Starting QuickWish Backend API Tests")
        print(f"Backend URL: {BACKEND_URL}")
        
        # Test public APIs first
        self.test_public_apis()
        
        # Setup test user and session
        if self.setup_test_user_session():
            # Test auth APIs
            self.test_auth_apis()
            
            # Test protected APIs
            self.test_protected_apis()
            
            # Test user APIs
            self.test_user_apis()
        
        # Test unauthorized access protection
        self.test_unauthorized_access()
        
        # Print summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print("🏁 TEST SUMMARY")
        print("="*60)
        
        total_tests = 0
        passed_tests = 0
        
        for category, tests in self.results.items():
            if category == "errors":
                continue
            
            print(f"\n📋 {category.upper().replace('_', ' ')}:")
            for endpoint, result in tests.items():
                status = "✅ PASS" if result["success"] else "❌ FAIL"
                print(f"  {status} {endpoint}")
                total_tests += 1
                if result["success"]:
                    passed_tests += 1
        
        if self.results["errors"]:
            print(f"\n🚨 ERRORS ({len(self.results['errors'])}):")
            for error in self.results["errors"]:
                print(f"  • {error}")
        
        print(f"\n📊 OVERALL: {passed_tests}/{total_tests} tests passed ({(passed_tests/total_tests*100):.1f}%)")
        
        if passed_tests == total_tests:
            print("🎉 All tests passed!")
        else:
            print("⚠️  Some tests failed - check details above")

if __name__ == "__main__":
    tester = QuickWishAPITester()
    tester.run_all_tests()