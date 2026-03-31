-- Miscellaneous Expenses Table
-- For tracking non-purchase order expenses like food, truck parts, donations, etc.

CREATE TABLE IF NOT EXISTS miscellaneous_expenses (
    id VARCHAR(50) PRIMARY KEY,
    description TEXT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    category VARCHAR(50) NOT NULL,
    expense_date DATE NOT NULL,
    created_by VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_miscellaneous_expenses_date ON miscellaneous_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_miscellaneous_expenses_category ON miscellaneous_expenses(category);
CREATE INDEX IF NOT EXISTS idx_miscellaneous_expenses_created_at ON miscellaneous_expenses(created_at);

-- Insert sample categories (optional - can be removed)
INSERT INTO miscellaneous_expenses (id, description, amount, category, expense_date, created_by) VALUES
('MISC-1700000000000', 'Employee Lunch', 500.00, 'Food', '2026-03-27', 'Admin'),
('MISC-1700000000001', 'Truck Parts - Brake Pads', 2000.00, 'Vehicle Parts', '2026-03-27', 'Admin')
ON CONFLICT (id) DO NOTHING;
