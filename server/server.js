import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/db.js';
import studentRoutes from './routes/students.js';
import readline from 'readline';
import bcrypt from 'bcryptjs';

// Load env vars
dotenv.config();

// Connect to database
connectDB().then(() => fixDepartmentValues());
const fixDepartmentValues = async () => {
    const User = (await import('./models/User.js')).default;

    await User.updateMany(
        { department: { $regex: /^cse$/i } },   // matches cse, Cse, cSe, etc.
        { $set: { department: "CSE" } }
    );

    console.log("✅ Fixed lowercase department values");
};


const app = express();

// Get directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));
app.use('/api/students', studentRoutes);

// Enable CORS
app.use(cors({
    origin: [
        "https://msd-hackathon-1.onrender.com",
        "http://localhost:3000"
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
}));


// Security headers
app.use((req, res, next) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// Rate limiting (simple implementation)
const rateLimit = new Map();
app.use((req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const windowStart = now - 15 * 60 * 1000; // 15 minutes window
    const requestCount = (rateLimit.get(ip) || []).filter(time => time > windowStart).length;

    if (requestCount > 100) { // 100 requests per 15 minutes
        return res.status(429).json({
            success: false,
            message: 'Too many requests, please try again later.'
        });
    }

    if (!rateLimit.has(ip)) {
        rateLimit.set(ip, []);
    }
    rateLimit.get(ip).push(now);

    // Clean up old entries
    rateLimit.set(ip, rateLimit.get(ip).filter(time => time > windowStart));
    next();
});

// Route files
import authRoutes from './routes/auth.js';
import paymentRoutes from './routes/payments.js';

// 🚨 SIMPLE TEST ROUTE FIRST
app.get('/api/test', (req, res) => {
    console.log('✅ Test route called');
    res.json({ success: true, message: 'Test route works!' });
});

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);


app.get('/api/debug/check-admin', async (req, res) => {
    try {
        console.log('🔍 CHECK-ADMIN route called!');

        const UserModule = await import('./models/User.js');
        const User = UserModule.default;

        const admin = await User.findOne({ email: 'adminpayments@gmail.com' })
            .select('+password');

        res.json({
            success: true,
            adminExists: !!admin,
            adminDetails: admin ? {
                email: admin.email,
                name: admin.name,
                role: admin.role,
                mobile: admin.mobile,
                department: admin.department,
                regNo: admin.regNo,
                createdAt: admin.createdAt,
                passwordHash: admin.password    // ✅ SHOW THE HASH
            } : null
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ✅ FINAL FIX: Reset admin password (single hash, no double hashing)
app.get("/api/debug/reset-admin", async (req, res) => {
    try {
        const UserModule = await import("./models/User.js");
        const User = UserModule.default;

        const bcrypt = (await import("bcryptjs")).default;

        const plainPassword = "adminforPayments@university.com";

        // ✅ Hash ONLY once
        const hashed = await bcrypt.hash(plainPassword, 10);

        // ✅ Use updateOne (NO pre-save hook → NO double hashing)
        await User.updateOne(
            { email: "adminpayments@gmail.com" },
            { $set: { password: hashed, role: "admin" } },
            { runValidators: false }
        );

        res.json({
            success: true,
            message: "Admin password reset to default ✅",
            loginEmail: "adminpayments@gmail.com",
            loginPassword: plainPassword
        });

    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});


// 🚨 ADDED: Debug routes - GET VERSIONS FOR BROWSER
app.get('/api/debug/fix-admin', async (req, res) => {
    try {
        console.log('🛠️ FIX-ADMIN GET route called - Fixing admin password...');
        
        const UserModule = await import('./models/User.js');
        const User = UserModule.default;
        
        console.log('📋 Checking if admin user exists...');
        let admin = await User.findOne({ email: 'adminpayments@gmail.com' });
        console.log('👤 Admin found:', admin ? 'Yes' : 'No');
        
        if (!admin) {
            console.log('🆕 Creating new admin user...');

            // Provide plain password to User.create so model pre-save hashing runs once
            admin = await User.create({
                name: 'Admin',
                email: 'adminpayments@gmail.com',
                password: 'adminforPayments@university.com',
                role: 'admin',
                mobile: '0000000000', // 🚨 ADDED DEFAULT MOBILE
                department: 'CSE' // 🚨 ADDED DEFAULT DEPARTMENT
            });
            console.log('✅ New admin created');
        } else {
            console.log('🔄 Resetting existing admin password...');

            // Set plain password and save so pre-save hook hashes it exactly once
            admin.password = 'adminforPayments@university.com';
            await admin.save();
            console.log('✅ Admin password reset');
        }
        
        res.json({ 
            success: true, 
            message: 'Admin password fixed successfully',
            adminEmail: admin.email
        });
        
    } catch (error) {
        console.error('❌ Error in debug route:', error);
        res.status(500).json({ 
            success: false,
            error: error.message
        });
    }
});

app.get("/fix-admin-password", async (req, res) => {
  try {
    const User = (await import("./models/User.js")).default;
    const bcrypt = (await import("bcryptjs")).default;

    const hash = await bcrypt.hash("adminforPayments@university.com", 10);

    await User.updateOne(
      { email: "adminpayments@gmail.com" },
      { $set: { password: hash } }
    );

    res.json({
      success: true,
      message: "✅ Admin password reset successfully",
      loginEmail: "adminpayments@gmail.com",
      loginPassword: "adminforPayments@university.com"
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


app.get('/api/debug/check-admin', async (req, res) => {
    try {
        console.log('🔍 CHECK-ADMIN route called!');
        
        const UserModule = await import('./models/User.js');
        const User = UserModule.default;
        
        const admin = await User.findOne({ email: 'adminpayments@gmail.com' }).select('+password');
        
        res.json({
            success: true,
            adminExists: !!admin,
            adminData: admin ? {
                email: admin.email,
                name: admin.name,
                role: admin.role,
                mobile: admin.mobile, // 🚨 ADDED MOBILE
                department: admin.department, // 🚨 ADDED DEPARTMENT
                createdAt: admin.createdAt
            } : null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🚨 ADDED: ADMIN MANAGEMENT FEATURE
const createAdminInterface = () => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const createNewAdmin = async () => {
        try {
            const UserModule = await import('./models/User.js');
            const User = UserModule.default;

            // Check current admin count
            const adminCount = await User.countDocuments({ role: 'admin' });
            console.log(`\n📊 Current admin count: ${adminCount}`);

            if (adminCount >= 2) {
                console.log('❌ Maximum admin limit reached (2 admins allowed)');
                console.log('💡 Existing admins:');
                const existingAdmins = await User.find({ role: 'admin' }).select('email name mobile department');
                existingAdmins.forEach(admin => {
                    console.log(`   - ${admin.email} (${admin.name}) - ${admin.mobile} - ${admin.department}`);
                });
                rl.close();
                return;
            }

            console.log('\n👑 CREATE NEW ADMIN ACCOUNT');
            console.log('============================');

            rl.question('Enter admin email: ', async (email) => {
                if (!email) {
                    console.log('❌ Email is required');
                    rl.close();
                    return;
                }

                // Check if email already exists
                const existingUser = await User.findOne({ email: email.toLowerCase() });
                if (existingUser) {
                    console.log(`❌ User with email ${email} already exists`);
                    rl.close();
                    return;
                }

                rl.question('Enter admin password (min 6 characters): ', async (password) => {
                    if (!password || password.length < 6) {
                        console.log('❌ Password must be at least 6 characters');
                        rl.close();
                        return;
                    }

                    // 🚨 ADDED MOBILE NUMBER PROMPT
                    rl.question('Enter mobile number (10 digits): ', async (mobile) => {
                        if (!mobile || !/^[0-9]{10}$/.test(mobile)) {
                            console.log('❌ Please enter a valid 10-digit mobile number');
                            rl.close();
                            return;
                        }

                        // 🚨 ADDED DEPARTMENT PROMPT
                        rl.question('Enter department (CSE, ECE, MECH, EEE, AIML, IT, LAW, BBA, BCOM, MCA, MBA, MCS): ', async (department) => {
                            const validDepartments = ['CSE', 'ECE', 'MECH', 'EEE', 'AIML', 'IT', 'LAW', 'BBA', 'BCOM', 'MCA', 'MBA', 'MCS'];
                            
                            if (!department || !validDepartments.includes(department.toUpperCase())) {
                                console.log('❌ Please select a valid department from the list');
                                rl.close();
                                return;
                            }

                            rl.question('Enter admin name: ', async (name) => {
                                if (!name) {
                                    console.log('❌ Name is required');
                                    rl.close();
                                    return;
                                }

                                try {
                                    // Create new admin WITH ALL REQUIRED FIELDS
                                    // Provide plain password to User.create so the pre-save hook
                                    // hashes it once (avoid double hashing)
                                    const newAdmin = await User.create({
                                        name: name.trim(),
                                        email: email.toLowerCase(),
                                        password: password,
                                        role: 'admin',
                                        mobile: mobile, // 🚨 ADDED MOBILE
                                        department: department.toUpperCase(), // 🚨 ADDED DEPARTMENT
                                        regNo: `ADMIN${Date.now()}` // Generate unique admin reg number
                                    });

                                    console.log(`\n✅ NEW ADMIN CREATED SUCCESSFULLY!`);
                                    console.log(`📧 Email: ${newAdmin.email}`);
                                    console.log(`👤 Name: ${newAdmin.name}`);
                                    console.log(`📱 Mobile: ${newAdmin.mobile}`);
                                    console.log(`🏫 Department: ${newAdmin.department}`);
                                    console.log(`🔑 Role: ${newAdmin.role}`);
                                    console.log(`🆔 ID: ${newAdmin._id}`);
                                    console.log('\n💡 This admin can now login from the frontend!');

                                    // Show all admins
                                    const allAdmins = await User.find({ role: 'admin' }).select('email name mobile department createdAt');
                                    console.log('\n📋 ALL ADMIN ACCOUNTS:');
                                    allAdmins.forEach((admin, index) => {
                                        console.log(`   ${index + 1}. ${admin.email} - ${admin.name} (${admin.department}) - ${admin.mobile} (Created: ${admin.createdAt.toLocaleDateString()})`);
                                    });

                                } catch (error) {
                                    console.error('❌ Error creating admin:', error.message);
                                }

                                rl.close();
                            });
                        });
                    });
                });
            });

        } catch (error) {
            console.error('❌ Error:', error.message);
            rl.close();
        }
    };

    // Start the admin creation interface
    setTimeout(() => {
        console.log('\n🎯 ADMIN MANAGEMENT CONSOLE');
        console.log('===========================');
        console.log('Type "create admin" to add a new admin account');
        console.log('Type "exit" to close this console');
        console.log('===========================\n');

        const handleCommand = (command) => {
            if (command.trim().toLowerCase() === 'create admin') {
                createNewAdmin();
            } else if (command.trim().toLowerCase() === 'exit') {
                console.log('👋 Admin console closed');
                rl.close();
            } else {
                console.log('❌ Unknown command. Type "create admin" or "exit"');
                rl.question('> ', handleCommand);
            }
        };

        rl.question('> ', handleCommand);
    }, 2000);
};

// Health check route
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is running healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});


// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error handler:', err.stack);

    let error = { ...err };
    error.message = err.message;

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = 'Resource not found';
        error = { message, statusCode: 404 };
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const message = 'Duplicate field value entered';
        error = { message, statusCode: 400 };
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message).join(', ');
        error = { message, statusCode: 400 };
    }

    res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    
    // 🚨 Start admin management console
    //createAdminInterface();
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
    console.log('Unhandled Rejection at:', promise, 'reason:', err);
    // Close server & exit process
    server.close(() => {
        process.exit(1);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.log('Uncaught Exception thrown:', err);
    process.exit(1);
});

export default app;
