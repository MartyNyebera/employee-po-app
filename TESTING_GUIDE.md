# 🧪 **SYSTEM TESTING CHECKLIST**

## **🔧 PRE-TESTING SETUP**

### **1. Verify System Status**
```bash
# Check both servers are running
curl http://localhost:3001/health  # Should return "ok"
# Frontend should be accessible at http://localhost:3000
```

### **2. Test Database Connection**
```bash
node -e "import('./server/db.js').then(db => db.testConnection())"
```

---

## **👤 USER ACCOUNT TESTING**

### **Test Admin Account**
1. **Access Admin Portal**
   - URL: `http://localhost:3000`
   - Login with existing admin credentials
   - Verify dashboard loads correctly

2. **Create New Admin (if needed)**
   - Use registration endpoint or admin creation script
   - Test admin role permissions

### **Test Employee Account**
1. **Register Employee**
   - Go to employee portal: `http://localhost:3000/employee`
   - Click "Register" or "Sign Up"
   - Fill in: name, email, password
   - Verify registration success

2. **Employee Login**
   - Login with new employee credentials
   - Verify employee dashboard loads

### **Test Driver Account**
1. **Register Driver**
   - Go to driver portal: `http://localhost:3000/driver`
   - Fill in: full_name, email, password, phone, license_number
   - Verify registration success

2. **Driver Login**
   - Login with driver credentials
   - Verify driver portal loads with GPS features

---

## **🚗 FLEET MANAGEMENT TESTING**

### **1. Add Vehicle**
```
Steps:
1. Login as Admin
2. Navigate to Fleet Management
3. Click "Add Vehicle" or "Add Vehicle Modal"
4. Fill in:
   - Unit Name: "Test Vehicle 001"
   - Vehicle Type: "Truck"
   - Plate Number: "TEST-123"
   - Tracker ID: "GPS001" (optional)
5. Click "Save"
Expected: Vehicle appears in fleet list
```

### **2. Vehicle Details**
```
Steps:
1. Click on the newly created vehicle
2. Verify all details display correctly
3. Check maintenance section
4. Verify odometer logging works
Expected: All vehicle information visible and editable
```

### **3. Maintenance Records**
```
Steps:
1. Go to vehicle details
2. Add maintenance record:
   - Description: "Oil Change"
   - Service Date: Today's date
   - Odometer: 1000
   - Total Cost: 50.00
3. Save record
Expected: Maintenance appears in vehicle history
```

---

## **📦 PURCHASE ORDER TESTING**

### **1. Create Purchase Order**
```
Steps:
1. Login as Admin
2. Navigate to Purchase Orders
3. Click "Create Purchase Order"
4. Fill in:
   - Supplier: "Test Supplier"
   - Order Date: Today
   - Expected Delivery: Next week
   - Items: Add 1-2 items with quantities
   - Total Amount: Calculate total
5. Submit order
Expected: Order appears in purchase orders list with "Pending" status
```

### **2. Approve Purchase Order**
```
Steps:
1. Find the created purchase order
2. Click "Approve"
3. Add approval notes
4. Confirm approval
Expected: Order status changes to "Approved"
```

---

## **📋 INVENTORY TESTING**

### **1. View Inventory**
```
Steps:
1. Login as Admin or Employee
2. Navigate to Inventory section
3. Verify inventory items display
4. Check quantities and locations
Expected: All inventory items visible with correct quantities
```

### **2. Add Inventory Item**
```
Steps:
1. Click "Add Item" or "Create Inventory Item"
2. Fill in:
   - Item Code: "TEST-001"
   - Item Name: "Test Product"
   - Description: "Test item for validation"
   - Quantity: 100
   - Unit: "pieces"
   - Unit Cost: 10.00
   - Location: "Warehouse A"
3. Save item
Expected: New item appears in inventory list
```

### **3. Update Inventory**
```
Steps:
1. Click on existing inventory item
2. Modify quantity or details
3. Save changes
Expected: Item updates successfully
```

---

## **👥 EMPLOYEE PORTAL TESTING**

### **1. Material Request**
```
Steps:
1. Login as Employee
2. Navigate to "Material Requests"
3. Click "New Request"
4. Fill in:
   - Item Needed: "Office Supplies"
   - Quantity: 10
   - Urgency: "Normal"
   - Justification: "Monthly office restock"
5. Submit request
Expected: Request appears with "Pending" status
```

### **2. Request Status Tracking**
```
Steps:
1. View submitted requests
2. Check status updates
3. Verify notifications work
Expected: Can track request progress
```

### **3. Inventory Viewing**
```
Steps:
1. Navigate to Inventory section
2. Browse available items
3. Check stock levels
Expected: Employee can view inventory but not modify
```

---

## **🚚 DRIVER PORTAL TESTING**

### **1. GPS Tracking Setup**
```
Steps:
1. Login as Driver
2. Enable location tracking in browser
3. Allow GPS permissions
4. Verify location appears on map
Expected: Driver's current location shows on map
```

### **2. Location Updates**
```
Steps:
1. Move to different location (or simulate)
2. Refresh map
3. Verify location updates
Expected: Map shows updated position
```

### **3. Chat Functionality**
```
Steps:
1. Open chat section
2. Send message to admin
3. Verify message sends successfully
Expected: Chat works for driver-admin communication
```

---

## **💰 FINANCIAL TESTING**

### **1. Transaction Recording**
```
Steps:
1. Login as Admin
2. Navigate to Financial section
3. Add transaction:
   - Type: "Fuel"
   - Amount: 100.00
   - Description: "Vehicle fueling"
   - Date: Today
4. Save transaction
Expected: Transaction appears in financial records
```

### **2. Financial Overview**
```
Steps:
1. View financial dashboard
2. Check revenue, expenses, profit calculations
3. Verify totals are correct
Expected: Financial summary displays accurate data
```

---

## **🔄 WORKFLOW TESTING**

### **Complete Order Workflow**
```
1. Create Purchase Order (Admin)
2. Approve Purchase Order (Admin)
3. Receive Items (update inventory)
4. Create Sales Order (Admin)
5. Approve Sales Order (Admin)
6. Assign to Driver (Admin)
7. Track Delivery (Driver)
8. Complete Delivery (Driver)
9. Update Financial Records (Admin)
Expected: Complete workflow functions end-to-end
```

---

## **📱 MOBILE RESPONSIVENESS TESTING**

### **Test on Different Screen Sizes**
```
1. Resize browser to mobile dimensions
2. Test all portals on mobile view
3. Verify navigation works
4. Check forms are usable
Expected: All features work on mobile devices
```

---

## **⚠️ ERROR TESTING**

### **Test Error Scenarios**
```
1. Invalid login credentials
2. Duplicate email registration
3. Negative inventory quantities
4. Invalid dates in forms
5. Network connection issues
Expected: Appropriate error messages and graceful handling
```

---

## **🔍 API TESTING**

### **Test Key Endpoints**
```bash
# Test authentication
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"test123"}'

# Test data endpoints
curl http://localhost:3001/api/vehicles
curl http://localhost:3001/api/inventory
curl http://localhost:3001/api/purchase-orders
```

---

## **📊 PERFORMANCE TESTING**

### **Load Testing**
```
1. Open multiple tabs with different portals
2. Simultaneous user actions
3. GPS tracking with multiple drivers
4. Large data set operations
Expected: System remains responsive under load
```

---

## **✅ SUCCESS CRITERIA**

### **Pass/Fail Checklist**
- [ ] All user types can login successfully
- [ ] Fleet management functions work
- [ ] Purchase orders can be created and approved
- [ ] Inventory management works correctly
- [ ] GPS tracking updates in real-time
- [ ] Financial transactions record properly
- [ ] Mobile interface is functional
- [ ] Error handling works appropriately
- [ ] Data persists correctly
- [ ] Multi-user functionality works

---

## **🐛 COMMON ISSUES & SOLUTIONS**

### **If GPS Doesn't Work**
- Check browser location permissions
- Ensure HTTPS is enabled for production
- Verify coordinates are being sent

### **If Login Fails**
- Check user exists in database
- Verify password hashing
- Check JWT token generation

### **If Data Doesn't Save**
- Check database connection
- Verify table schemas
- Check API endpoint responses

---

## **📝 TESTING LOG**

### **Document Your Results**
```
Date: ___________
Tester: ___________
Environment: Development/Production

Test Results:
✅ Admin Login: PASS/FAIL
✅ Employee Portal: PASS/FAIL
✅ Driver GPS: PASS/FAIL
✅ Purchase Orders: PASS/FAIL
✅ Inventory: PASS/FAIL
✅ Financial: PASS/FAIL

Issues Found:
1. _________________________
2. _________________________
3. _________________________

Recommendations:
1. _________________________
2. _________________________
```

---

## **🚀 NEXT STEPS**

### **After Testing Complete**
1. **Document Issues**: Record all bugs and improvements needed
2. **Prioritize Fixes**: Focus on critical issues first
3. **Plan Enhancements**: Based on testing feedback
4. **Prepare for Production**: Final optimizations and security checks

**🎯 Follow this checklist systematically to ensure your system is fully tested and ready for production use!**
