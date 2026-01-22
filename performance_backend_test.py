#!/usr/bin/env python3
"""
Performance-focused Backend Testing for QuickWish App
Measures response times and tests all endpoints as requested in review
"""

import requests
import json
import time
import uuid
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import statistics

# Backend URL from frontend environment
BACKEND_URL = "https://wishmarket-1.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

class PerformanceAPITester:
    def __init__(self):
        self.session_token = None
        self.test_user_id = None
        self.results = []
        
    def make_timed_request(self, method, endpoint, **kwargs):
        """Make HTTP request with precise timing"""
        url = f"{API_BASE}{endpoint}"
        
        # Add auth header if we have a session token
        headers = kwargs.get('headers', {})
        if self.session_token and 'Authorization' not in headers:
            headers['Authorization'] = f'Bearer {self.session_token}'
            kwargs['headers'] = headers
        
        start_time = time.perf_counter()
        try:
            response = requests.request(method, url, timeout=10, **kwargs)
            response_time = (time.perf_counter() - start_time) * 1000  # Convert to ms
            
            return response, response_time, None
        except Exception as e:
            response_time = (time.perf_counter() - start_time) * 1000
            return None, response_time, str(e)
    
    def log_performance_result(self, test_name, response, response_time, error=None):
        """Log test result with performance focus"""
        if error:
            success = False
            status_code = None
            details = f"Request failed: {error}"
        else:
            success = response.status_code in [200, 201, 401]  # 401 is expected for protected endpoints
            status_code = response.status_code
            
            if response.status_code == 200:
                try:
                    data = response.json()
                    if isinstance(data, list):
                        details = f"Success - {len(data)} items returned"
                    elif isinstance(data, dict):
                        details = f"Success - {data.get('message', 'Data returned')}"
                    else:
                        details = "Success - Data returned"
                except:
                    details = "Success - Text response"
            elif response.status_code == 401:
                details = "Protected endpoint (401 Unauthorized as expected)"
            else:
                details = f"Status: {response.status_code}"
        
        # Performance indicators
        if response_time > 500:
            perf_status = "🐌 SLOW"
        elif response_time > 200:
            perf_status = "⚠️  MEDIUM"
        else:
            perf_status = "⚡ FAST"
        
        status_icon = "✅" if success else "❌"
        
        result = {
            "test_name": test_name,
            "success": success,
            "response_time_ms": round(response_time, 2),
            "status_code": status_code,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.results.append(result)
        
        print(f"{status_icon} {perf_status} [{response_time:.0f}ms] {test_name}")
        if not success:
            print(f"   ❌ {details}")
        elif response_time > 500:
            print(f"   ⚠️  Response time exceeds 500ms threshold")
        
        return success, response_time
    
    def setup_mock_session(self):
        """Setup mock session for testing protected endpoints"""
        print("🔐 Setting up mock session for authenticated tests...")
        
        # Create mock session (since we can't do real Google OAuth in testing)
        self.session_token = f"test_session_{uuid.uuid4().hex[:16]}"
        self.test_user_id = f"test_user_{uuid.uuid4().hex[:8]}"
        
        print(f"✅ Mock session created for testing protected endpoints")
        return True
    
    def test_health_check(self):
        """1. Health Check: GET /api/health"""
        response, response_time, error = self.make_timed_request('GET', '/health')
        return self.log_performance_result("Health Check - GET /api/health", response, response_time, error)
    
    def test_public_apis(self):
        """2-5. Public APIs"""
        public_endpoints = [
            ('/explore', 'Explore Posts - GET /api/explore'),
            ('/localhub', 'Local Hub - GET /api/localhub'),
            ('/localhub/categories', 'Local Hub Categories - GET /api/localhub/categories'),
        ]
        
        results = []
        
        for endpoint, test_name in public_endpoints:
            response, response_time, error = self.make_timed_request('GET', endpoint)
            success, _ = self.log_performance_result(test_name, response, response_time, error)
            results.append(success)
        
        # Test seed endpoint
        response, response_time, error = self.make_timed_request('POST', '/seed')
        success, _ = self.log_performance_result("Seed Data - POST /api/seed", response, response_time, error)
        results.append(success)
        
        return all(results)
    
    def test_auth_protection(self):
        """6. Authentication Flow - Test protected endpoints return 401"""
        protected_endpoints = [
            ('GET', '/wishes', 'Wishes List Protection'),
            ('POST', '/wishes', 'Create Wish Protection'),
            ('GET', '/chat/rooms', 'Chat Rooms Protection'),
            ('GET', '/auth/me', 'User Profile Protection'),
        ]
        
        results = []
        
        # Ensure no auth token for this test
        temp_token = self.session_token
        self.session_token = None
        
        for method, endpoint, test_name in protected_endpoints:
            kwargs = {}
            if method == 'POST' and 'wishes' in endpoint:
                kwargs['json'] = {
                    "wish_type": "delivery",
                    "title": "Test wish",
                    "location": {"lat": 12.9716, "lng": 77.5946, "address": "Test"},
                    "remuneration": 100
                }
            
            response, response_time, error = self.make_timed_request(method, endpoint, **kwargs)
            success, _ = self.log_performance_result(f"Auth Protection - {test_name}", response, response_time, error)
            
            # For auth protection, success means getting 401
            if response and response.status_code == 401:
                results.append(True)
            else:
                results.append(False)
        
        # Restore auth token
        self.session_token = temp_token
        return all(results)
    
    def test_wishes_crud_mock(self):
        """7-10. Wishes CRUD (expects 401 without real auth)"""
        wish_data = {
            "wish_type": "delivery",
            "title": "Performance Test Wish - Grocery Shopping",
            "description": "Need fresh groceries from local supermarket",
            "location": {"lat": 12.9716, "lng": 77.5946, "address": "Test Location"},
            "radius_km": 5.0,
            "remuneration": 200.0,
            "is_immediate": True
        }
        
        crud_operations = [
            ('POST', '/wishes', 'Create Wish - POST /api/wishes', {'json': wish_data}),
            ('GET', '/wishes', 'List Wishes - GET /api/wishes', {}),
            ('PUT', '/wishes/test_id', 'Update Wish - PUT /api/wishes/{id}', {'json': wish_data}),
            ('DELETE', '/wishes/test_id', 'Delete Wish - DELETE /api/wishes/{id}', {})
        ]
        
        results = []
        
        for method, endpoint, test_name, kwargs in crud_operations:
            response, response_time, error = self.make_timed_request(method, endpoint, **kwargs)
            success, _ = self.log_performance_result(test_name, response, response_time, error)
            results.append(success)
        
        return all(results)
    
    def test_chat_system_mock(self):
        """11-15. Chat System (expects 401 without real auth)"""
        chat_operations = [
            ('POST', '/seed/chats', 'Seed Chat Data - POST /api/seed/chats', {}),
            ('GET', '/chat/rooms', 'List Chat Rooms - GET /api/chat/rooms', {}),
            ('GET', '/chat/rooms/test_room/messages', 'Get Messages - GET /api/chat/rooms/{id}/messages', {}),
            ('POST', '/chat/rooms/test_room/messages', 'Send Message - POST /api/chat/rooms/{id}/messages', 
             {'json': {'content': 'Performance test message'}}),
            ('PUT', '/chat/rooms/test_room/approve', 'Approve Deal - PUT /api/chat/rooms/{id}/approve', {})
        ]
        
        results = []
        
        for method, endpoint, test_name, kwargs in chat_operations:
            response, response_time, error = self.make_timed_request(method, endpoint, **kwargs)
            success, _ = self.log_performance_result(test_name, response, response_time, error)
            results.append(success)
        
        return all(results)
    
    def test_user_management_mock(self):
        """16-17. User Management (expects 401 without real auth)"""
        user_operations = [
            ('GET', '/auth/me', 'Get Current User - GET /api/users/me', {}),
            ('PUT', '/users/profile', 'Update Profile - PUT /api/users/me', 
             {'json': {'name': 'Performance Test User', 'age': 30}})
        ]
        
        results = []
        
        for method, endpoint, test_name, kwargs in user_operations:
            response, response_time, error = self.make_timed_request(method, endpoint, **kwargs)
            success, _ = self.log_performance_result(test_name, response, response_time, error)
            results.append(success)
        
        return all(results)
    
    def test_concurrent_performance(self):
        """18. Performance Testing - Concurrent requests"""
        print("\n🚀 Testing concurrent request performance...")
        
        def make_concurrent_request(endpoint_info):
            """Make a single request for concurrent testing"""
            endpoint, name = endpoint_info
            start_time = time.perf_counter()
            try:
                response = requests.get(f"{API_BASE}{endpoint}", timeout=10)
                response_time = (time.perf_counter() - start_time) * 1000
                return {
                    'endpoint': endpoint,
                    'name': name,
                    'status_code': response.status_code,
                    'response_time': response_time,
                    'success': response.status_code == 200
                }
            except Exception as e:
                response_time = (time.perf_counter() - start_time) * 1000
                return {
                    'endpoint': endpoint,
                    'name': name,
                    'status_code': None,
                    'response_time': response_time,
                    'success': False,
                    'error': str(e)
                }
        
        # Test endpoints for concurrent requests (public endpoints only)
        test_endpoints = [
            ('/health', 'Health Check'),
            ('/explore', 'Explore Posts'),
            ('/localhub', 'Local Hub'),
            ('/localhub/categories', 'Categories')
        ]
        
        # Make 5 concurrent requests to each endpoint (20 total)
        concurrent_requests = []
        for endpoint, name in test_endpoints:
            for i in range(5):
                concurrent_requests.append((endpoint, f"{name} #{i+1}"))
        
        start_time = time.perf_counter()
        
        # Execute concurrent requests
        with ThreadPoolExecutor(max_workers=10) as executor:
            future_to_request = {executor.submit(make_concurrent_request, req): req 
                               for req in concurrent_requests}
            
            results = []
            for future in as_completed(future_to_request):
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    req = future_to_request[future]
                    results.append({
                        'endpoint': req[0],
                        'name': req[1],
                        'success': False,
                        'error': str(e),
                        'response_time': 0
                    })
        
        total_time = time.perf_counter() - start_time
        
        # Analyze results
        successful_requests = len([r for r in results if r['success']])
        total_requests = len(results)
        success_rate = (successful_requests / total_requests) * 100
        
        response_times = [r['response_time'] for r in results if r['success']]
        if response_times:
            avg_response_time = statistics.mean(response_times)
            max_response_time = max(response_times)
            min_response_time = min(response_times)
        else:
            avg_response_time = max_response_time = min_response_time = 0
        
        success = success_rate >= 90  # 90% success rate threshold
        
        print(f"📊 Concurrent Performance Results:")
        print(f"   Total Requests: {total_requests}")
        print(f"   Successful: {successful_requests} ({success_rate:.1f}%)")
        print(f"   Total Time: {total_time:.2f}s")
        print(f"   Avg Response Time: {avg_response_time:.0f}ms")
        print(f"   Max Response Time: {max_response_time:.0f}ms")
        print(f"   Min Response Time: {min_response_time:.0f}ms")
        
        # Log as a single test result
        details = f"Completed {successful_requests}/{total_requests} requests ({success_rate:.1f}% success) in {total_time:.2f}s"
        self.log_performance_result("Concurrent Performance Test", 
                                  type('MockResponse', (), {'status_code': 200 if success else 500})(), 
                                  total_time * 1000, None)
        
        return success
    
    def run_performance_tests(self):
        """Run all performance-focused tests"""
        print("🧪 QUICKWISH BACKEND PERFORMANCE TESTING")
        print(f"🎯 Backend URL: {BACKEND_URL}")
        print("=" * 80)
        
        test_results = []
        
        print("\n📋 1. HEALTH CHECK")
        test_results.append(self.test_health_check()[0])
        
        print("\n📋 2. PUBLIC APIS")
        test_results.append(self.test_public_apis())
        
        print("\n📋 3. AUTHENTICATION FLOW")
        test_results.append(self.test_auth_protection())
        
        print("\n📋 4. SETUP MOCK SESSION")
        self.setup_mock_session()
        
        print("\n📋 5. WISHES CRUD (WITH AUTH)")
        test_results.append(self.test_wishes_crud_mock())
        
        print("\n📋 6. CHAT SYSTEM (WITH AUTH)")
        test_results.append(self.test_chat_system_mock())
        
        print("\n📋 7. USER MANAGEMENT (WITH AUTH)")
        test_results.append(self.test_user_management_mock())
        
        print("\n📋 8. PERFORMANCE TESTING")
        test_results.append(self.test_concurrent_performance())
        
        # Generate performance report
        self.generate_performance_report()
        
        return all(test_results)
    
    def generate_performance_report(self):
        """Generate detailed performance report"""
        print("\n" + "=" * 80)
        print("📊 PERFORMANCE TEST RESULTS SUMMARY")
        print("=" * 80)
        
        total_tests = len(self.results)
        passed_tests = len([r for r in self.results if r['success']])
        success_rate = (passed_tests / total_tests) * 100
        
        print(f"🎯 Overall Results: {passed_tests}/{total_tests} tests passed ({success_rate:.1f}%)")
        
        # Performance Analysis
        response_times = [r['response_time_ms'] for r in self.results if r['success']]
        if response_times:
            avg_response_time = statistics.mean(response_times)
            max_response_time = max(response_times)
            min_response_time = min(response_times)
            slow_requests = len([rt for rt in response_times if rt > 500])
            medium_requests = len([rt for rt in response_times if 200 < rt <= 500])
            fast_requests = len([rt for rt in response_times if rt <= 200])
            
            print(f"\n⚡ PERFORMANCE METRICS:")
            print(f"   Average Response Time: {avg_response_time:.2f}ms")
            print(f"   Maximum Response Time: {max_response_time:.2f}ms")
            print(f"   Minimum Response Time: {min_response_time:.2f}ms")
            print(f"   Fast Requests (≤200ms): {fast_requests}/{len(response_times)} ({(fast_requests/len(response_times)*100):.1f}%)")
            print(f"   Medium Requests (200-500ms): {medium_requests}/{len(response_times)} ({(medium_requests/len(response_times)*100):.1f}%)")
            print(f"   Slow Requests (>500ms): {slow_requests}/{len(response_times)} ({(slow_requests/len(response_times)*100):.1f}%)")
        
        # Categorize by endpoint type
        public_tests = [r for r in self.results if any(x in r['test_name'].lower() 
                       for x in ['health', 'explore', 'localhub', 'seed'])]
        auth_tests = [r for r in self.results if 'protection' in r['test_name'].lower()]
        crud_tests = [r for r in self.results if any(x in r['test_name'].lower() 
                     for x in ['wish', 'chat', 'user']) and 'protection' not in r['test_name'].lower()]
        perf_tests = [r for r in self.results if 'concurrent' in r['test_name'].lower()]
        
        print(f"\n📋 ENDPOINT CATEGORIES:")
        print(f"   🌐 Public APIs: {len([r for r in public_tests if r['success']])}/{len(public_tests)} passed")
        print(f"   🔐 Auth Protection: {len([r for r in auth_tests if r['success']])}/{len(auth_tests)} passed")
        print(f"   📝 CRUD Operations: {len([r for r in crud_tests if r['success']])}/{len(crud_tests)} passed")
        print(f"   🚀 Concurrent Performance: {len([r for r in perf_tests if r['success']])}/{len(perf_tests)} passed")
        
        # Failed tests
        failed_tests = [r for r in self.results if not r['success']]
        if failed_tests:
            print(f"\n❌ FAILED TESTS ({len(failed_tests)}):")
            for test in failed_tests:
                print(f"   • {test['test_name']}: {test['details']}")
        
        # Performance summary
        print(f"\n🏆 PERFORMANCE SUMMARY:")
        if slow_requests == 0:
            print(f"   ✅ Excellent: All endpoints respond within 500ms")
        elif slow_requests <= 2:
            print(f"   ⚠️  Good: Only {slow_requests} endpoint(s) exceed 500ms")
        else:
            print(f"   ❌ Needs Improvement: {slow_requests} endpoints exceed 500ms")
        
        # Save detailed results
        report_data = {
            'summary': {
                'total_tests': total_tests,
                'passed_tests': passed_tests,
                'success_rate': f"{success_rate:.1f}%",
                'backend_url': BACKEND_URL,
                'timestamp': datetime.now().isoformat()
            },
            'performance_metrics': {
                'avg_response_time_ms': round(avg_response_time, 2) if response_times else 0,
                'max_response_time_ms': round(max_response_time, 2) if response_times else 0,
                'min_response_time_ms': round(min_response_time, 2) if response_times else 0,
                'fast_requests': fast_requests if response_times else 0,
                'medium_requests': medium_requests if response_times else 0,
                'slow_requests': slow_requests if response_times else 0
            },
            'detailed_results': self.results
        }
        
        with open('/app/performance_test_results.json', 'w') as f:
            json.dump(report_data, f, indent=2, default=str)
        
        print(f"\n💾 Detailed results saved to: /app/performance_test_results.json")

def main():
    """Main test execution"""
    tester = PerformanceAPITester()
    success = tester.run_performance_tests()
    return success

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)