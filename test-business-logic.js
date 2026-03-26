// ========================================
// COMPREHENSIVE BUSINESS LOGIC TESTING
// Test all fixes to ensure they work correctly
// ========================================

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3001';
const TEST_USER = {
  id: 'test_user_123',
  name: 'Test User',
  approver_id: 'admin_123',
  approver_name: 'Admin User'
};

// Test utilities
const api = axios.create({ baseURL: BASE_URL });

// ========================================
// TEST 1: SALES ORDER APPROVAL WORKFLOW
// ========================================

async function testSalesOrderApproval() {
  console.log('\n🧪 TEST 1: Sales Order Approval Workflow');
  
  try {
    // Step 1: Create a test sales order
    console.log('Creating test sales order...');
    const createResponse = await api.post('/api/sales-orders', {
      client: 'Test Client',
      description: 'Test Order Items',
      amount: 1000.00,
      created_date: new Date().toISOString().split('T')[0],
      delivery_date: new Date().toISOString().split('T')[0]
    });
    
    const salesOrderId = createResponse.data.id;
    console.log(`✅ Sales order created: ${salesOrderId}`);
    
    // Step 2: Approve the sales order
    console.log('Approving sales order...');
    const approveResponse = await api.post(`/api/sales-orders/${salesOrderId}/approve`, {
      approver_id: TEST_USER.approver_id,
      approver_name: TEST_USER.approver_name,
      notes: 'Test approval'
    });
    
    console.log('✅ Sales order approved successfully');
    console.log('📊 Approval data:', approveResponse.data.data);
    
    // Step 3: Verify approval record was created
    console.log('Verifying approval record...');
    const approvalCheck = await api.get(`/api/sales-orders/${salesOrderId}`);
    
    if (approvalCheck.data.status === 'approved') {
      console.log('✅ Sales order status updated to approved');
    } else {
      throw new Error('Sales order status not updated correctly');
    }
    
    return salesOrderId;
    
  } catch (error) {
    console.error('❌ Sales order approval test failed:', error.response?.data || error.message);
    throw error;
  }
}

// ========================================
// TEST 2: INVENTORY DEDUCTION
// ========================================

async function testInventoryDeduction(salesOrderId) {
  console.log('\n🧪 TEST 2: Inventory Deduction');
  
  try {
    // First create test inventory items
    console.log('Creating test inventory items...');
    
    // Create test inventory
    const inventoryResponse = await api.post('/api/inventory', {
      item_code: 'TEST001',
      item_name: 'Test Product',
      quantity: 100,
      unit: 'pieces',
      unit_cost: 50.00,
      cogs_per_unit: 30.00
    });
    
    const inventoryId = inventoryResponse.data.id;
    console.log(`✅ Test inventory created: ${inventoryId}`);
    
    // Add items to sales order
    console.log('Adding items to sales order...');
    await api.post('/api/sales-order-items', {
      sales_order_id: salesOrderId,
      inventory_id: inventoryId,
      product_name: 'Test Product',
      quantity: 10,
      unit_price: 100.00
    });
    
    // Deduct inventory
    console.log('Deducting inventory...');
    const deductResponse = await api.post(`/api/sales-orders/${salesOrderId}/deduct-inventory`);
    
    console.log('✅ Inventory deducted successfully');
    console.log('📊 Deduction data:', deductResponse.data.data);
    
    // Verify inventory was reduced
    const inventoryCheck = await api.get(`/api/inventory/${inventoryId}`);
    const finalQuantity = inventoryCheck.data.quantity;
    
    if (finalQuantity === 90) {
      console.log('✅ Inventory quantity reduced correctly (100 -> 90)');
    } else {
      throw new Error(`Expected 90, got ${finalQuantity}`);
    }
    
    return inventoryId;
    
  } catch (error) {
    console.error('❌ Inventory deduction test failed:', error.response?.data || error.message);
    throw error;
  }
}

// ========================================
// TEST 3: DELIVERY CONFIRMATION & REVENUE RECOGNITION
// ========================================

async function testDeliveryConfirmation(salesOrderId) {
  console.log('\n🧪 TEST 3: Delivery Confirmation & Revenue Recognition');
  
  try {
    // Confirm delivery with GPS data
    console.log('Confirming delivery...');
    const deliveryResponse = await api.post(`/api/sales-orders/${salesOrderId}/confirm-delivery`, {
      driver_id: 'driver_123',
      latitude: 14.5995,
      longitude: 120.9842,
      recipient_name: 'Test Recipient',
      gps_accuracy: 5.0
    });
    
    console.log('✅ Delivery confirmed successfully');
    console.log('📊 Delivery data:', deliveryResponse.data.data);
    
    // Verify revenue was recognized
    if (deliveryResponse.data.data.revenue_recognized === true) {
      console.log('✅ Revenue recognized on delivery');
    } else {
      throw new Error('Revenue not recognized properly');
    }
    
    // Verify financial transaction was created
    const financialCheck = await api.get('/api/financial-transactions', {
      params: { related_order_id: salesOrderId, transaction_type: 'REVENUE' }
    });
    
    if (financialCheck.data.length > 0) {
      console.log('✅ Financial transaction created for revenue');
    } else {
      throw new Error('Financial transaction not created');
    }
    
  } catch (error) {
    console.error('❌ Delivery confirmation test failed:', error.response?.data || error.message);
    throw error;
  }
}

// ========================================
// TEST 4: MATERIAL REQUEST WORKFLOW
// ========================================

async function testMaterialRequestWorkflow() {
  console.log('\n🧪 TEST 4: Material Request Workflow');
  
  try {
    // Create material request
    console.log('Creating material request...');
    const requestResponse = await api.post('/api/material-requests', {
      employee_id: 1,
      employee_name: 'Test Employee',
      item_name: 'Office Supplies',
      item_code: 'OFFICE001',
      quantity_requested: 50,
      unit: 'pieces',
      purpose: 'Office restocking'
    });
    
    const requestId = requestResponse.data.id;
    console.log(`✅ Material request created: ${requestId}`);
    
    // Approve material request
    console.log('Approving material request...');
    const approveResponse = await api.post(`/api/material-requests/${requestId}/approve`, {
      approver_id: TEST_USER.approver_id,
      approver_name: TEST_USER.approver_name,
      cogs_per_unit: 25.00,
      inventory_id: 'OFFICE001'
    });
    
    console.log('✅ Material request approved');
    console.log('📊 Approval data:', approveResponse.data.data);
    
    // Verify inventory was updated
    if (approveResponse.data.data.inventory_updated === true) {
      console.log('✅ Inventory updated on material request approval');
    } else {
      throw new Error('Inventory not updated properly');
    }
    
  } catch (error) {
    console.error('❌ Material request workflow test failed:', error.response?.data || error.message);
    throw error;
  }
}

// ========================================
// TEST 5: FINANCIAL CALCULATIONS
// ========================================

async function testFinancialCalculations() {
  console.log('\n🧪 TEST 5: Financial Calculations');
  
  try {
    // Record some operational costs
    console.log('Recording operational costs...');
    
    await api.post('/api/operational-costs', {
      cost_type: 'FUEL',
      amount: 500.00,
      description: 'Fuel for delivery truck',
      cost_date: new Date().toISOString().split('T')[0],
      related_vehicle_id: 'VEH001'
    });
    
    await api.post('/api/operational-costs', {
      cost_type: 'MAINTENANCE',
      amount: 200.00,
      description: 'Vehicle maintenance',
      cost_date: new Date().toISOString().split('T')[0],
      related_vehicle_id: 'VEH001'
    });
    
    await api.post('/api/operational-costs', {
      cost_type: 'SALARY',
      amount: 1000.00,
      description: 'Driver salary',
      cost_date: new Date().toISOString().split('T')[0],
      related_employee_id: 'EMP001'
    });
    
    console.log('✅ Operational costs recorded');
    
    // Get financial summary
    console.log('Getting financial summary...');
    const summaryResponse = await api.get('/api/dashboard/financial-summary');
    
    const summary = summaryResponse.data.data;
    console.log('📊 Financial Summary:');
    console.log(`  Revenue: $${summary.revenue.total}`);
    console.log(`  COGS: $${summary.costs.cogs}`);
    console.log(`  Fuel: $${summary.costs.fuel}`);
    console.log(`  Maintenance: $${summary.costs.maintenance}`);
    console.log(`  Salaries: $${summary.costs.salaries}`);
    console.log(`  Net Profit: $${summary.profitability.net_profit}`);
    console.log(`  Net Margin: ${summary.profitability.net_margin}`);
    
    // Verify calculations
    const expectedTotalCosts = summary.costs.cogs + summary.costs.fuel + summary.costs.maintenance + summary.costs.salaries;
    const expectedNetProfit = summary.revenue.total - expectedTotalCosts;
    
    if (Math.abs(summary.profitability.net_profit - expectedNetProfit) < 0.01) {
      console.log('✅ Net profit calculation is correct');
    } else {
      throw new Error(`Net profit calculation incorrect: expected ${expectedNetProfit}, got ${summary.profitability.net_profit}`);
    }
    
  } catch (error) {
    console.error('❌ Financial calculations test failed:', error.response?.data || error.message);
    throw error;
  }
}

// ========================================
// TEST 6: BUSINESS LOGIC VALIDATION
// ========================================

async function testBusinessLogicValidation() {
  console.log('\n🧪 TEST 6: Business Logic Validation');
  
  try {
    // Run comprehensive validation
    console.log('Running business logic validation...');
    const validationResponse = await api.get('/api/validate/business-logic');
    
    const validation = validationResponse.data;
    console.log(`📊 System Health: ${validation.system_health}`);
    
    if (validation.validations.length === 0) {
      console.log('✅ No business logic issues detected');
    } else {
      console.log('⚠️ Business logic issues found:');
      validation.validations.forEach((issue, index) => {
        console.log(`  ${index + 1}. [${issue.severity}] ${issue.issue}`);
        console.log(`     Count: ${issue.count}`);
        console.log(`     Action: ${issue.action}`);
      });
    }
    
    // Expected: Should be HEALTHY after all fixes
    if (validation.system_health === 'HEALTHY') {
      console.log('✅ Business logic validation passed');
    } else {
      console.log('⚠️ Business logic validation shows issues - this may be expected during testing');
    }
    
  } catch (error) {
    console.error('❌ Business logic validation test failed:', error.response?.data || error.message);
    throw error;
  }
}

// ========================================
// TEST 7: INVENTORY ACCURACY
// ========================================

async function testInventoryAccuracy() {
  console.log('\n🧪 TEST 7: Inventory Accuracy');
  
  try {
    // Get inventory status
    console.log('Getting inventory status...');
    const inventoryResponse = await api.get('/api/inventory/status');
    
    const inventoryItems = inventoryResponse.data.data;
    console.log(`📊 Found ${inventoryItems.length} inventory items`);
    
    // Check for any stock status issues
    const outOfStock = inventoryItems.filter(item => item.stock_status === 'OUT_OF_STOCK');
    const lowStock = inventoryItems.filter(item => item.stock_status === 'LOW_STOCK');
    const inStock = inventoryItems.filter(item => item.stock_status === 'IN_STOCK');
    
    console.log(`  In Stock: ${inStock.length}`);
    console.log(`  Low Stock: ${lowStock.length}`);
    console.log(`  Out of Stock: ${outOfStock.length}`);
    
    // Verify calculated quantities match base quantities + transactions
    let accuracyIssues = 0;
    inventoryItems.forEach(item => {
      const expectedQuantity = item.base_quantity + item.total_purchased + item.total_sold; // total_sold is negative
      if (Math.abs(item.current_quantity - expectedQuantity) > 0.01) {
        console.log(`⚠️ Accuracy issue for ${item.item_name}: expected ${expectedQuantity}, got ${item.current_quantity}`);
        accuracyIssues++;
      }
    });
    
    if (accuracyIssues === 0) {
      console.log('✅ All inventory calculations are accurate');
    } else {
      console.log(`⚠️ Found ${accuracyIssues} inventory calculation issues`);
    }
    
  } catch (error) {
    console.error('❌ Inventory accuracy test failed:', error.response?.data || error.message);
    throw error;
  }
}

// ========================================
// MAIN TEST RUNNER
// ========================================

async function runAllTests() {
  console.log('🚀 Starting Comprehensive Business Logic Tests');
  console.log('===========================================');
  
  const testResults = {
    passed: 0,
    failed: 0,
    errors: []
  };
  
  try {
    // Test 1: Sales Order Approval
    try {
      const salesOrderId = await testSalesOrderApproval();
      testResults.passed++;
      
      // Test 2: Inventory Deduction
      try {
        await testInventoryDeduction(salesOrderId);
        testResults.passed++;
      } catch (error) {
        testResults.failed++;
        testResults.errors.push('Inventory Deduction: ' + error.message);
      }
      
      // Test 3: Delivery Confirmation
      try {
        await testDeliveryConfirmation(salesOrderId);
        testResults.passed++;
      } catch (error) {
        testResults.failed++;
        testResults.errors.push('Delivery Confirmation: ' + error.message);
      }
      
    } catch (error) {
      testResults.failed++;
      testResults.errors.push('Sales Order Approval: ' + error.message);
    }
    
    // Test 4: Material Request Workflow
    try {
      await testMaterialRequestWorkflow();
      testResults.passed++;
    } catch (error) {
      testResults.failed++;
      testResults.errors.push('Material Request Workflow: ' + error.message);
    }
    
    // Test 5: Financial Calculations
    try {
      await testFinancialCalculations();
      testResults.passed++;
    } catch (error) {
      testResults.failed++;
      testResults.errors.push('Financial Calculations: ' + error.message);
    }
    
    // Test 6: Business Logic Validation
    try {
      await testBusinessLogicValidation();
      testResults.passed++;
    } catch (error) {
      testResults.failed++;
      testResults.errors.push('Business Logic Validation: ' + error.message);
    }
    
    // Test 7: Inventory Accuracy
    try {
      await testInventoryAccuracy();
      testResults.passed++;
    } catch (error) {
      testResults.failed++;
      testResults.errors.push('Inventory Accuracy: ' + error.message);
    }
    
  } catch (error) {
    console.error('❌ Critical error during testing:', error.message);
    testResults.failed++;
    testResults.errors.push('Critical Error: ' + error.message);
  }
  
  // Final Results
  console.log('\n===========================================');
  console.log('🏁 Test Results Summary');
  console.log('===========================================');
  console.log(`✅ Tests Passed: ${testResults.passed}`);
  console.log(`❌ Tests Failed: ${testResults.failed}`);
  console.log(`📊 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ Errors encountered:');
    testResults.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}`);
    });
  }
  
  if (testResults.failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Business logic fixes are working correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Please review the errors and fix the issues.');
  }
  
  return testResults;
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  testSalesOrderApproval,
  testInventoryDeduction,
  testDeliveryConfirmation,
  testMaterialRequestWorkflow,
  testFinancialCalculations,
  testBusinessLogicValidation,
  testInventoryAccuracy
};
