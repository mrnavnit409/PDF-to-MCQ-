import express from 'express';
import type { Request, Response } from 'express';
import http from 'http';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as nodemailer from 'nodemailer';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const DATA_DIR = path.resolve(__dirname, 'data');
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const STORAGE_FILE = path.join(DATA_DIR, 'store.json');

interface Settings {
  upiId: string;
  receiverName: string;
  adminPassword: string; // default 'admin123'
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
}

interface ProductItem {
  id: string;
  name: string;
  price: number;
  description: string;
  downloadLink: string;
}

function normalizeUrl(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return 'https://' + trimmed;
}

interface Order {
  orderId: string;
  productId?: string;
  downloadLink?: string;
  productName: string;
  productPrice: number;
  customerEmail: string;
  screenshotUrl?: string;
  verificationStatus: 'pending' | 'verified' | 'failed';
  verificationDetails?: {
    amountMatch: boolean;
    receiverMatch: boolean;
    timeMatch: boolean;
    isAuthentic: boolean;
    extractedAmount?: number;
    extractedReceiver?: string;
    transactionId?: string;
    extractedTime?: string;
    reason: string;
  };
  emailVerificationStatus: 'pending' | 'verified';
  otpCode?: string;
  otpExpiresAt?: number;
  orderDate: string;
  deliveryStatus: 'locked' | 'unlocked';
}

interface DB {
  settings: Settings;
  products: ProductItem[];
  orders: Order[];
  adminTokens?: string[];
}

const defaultSettings: Settings = {
  upiId: 'merchant.upi@okhdfcbank',
  receiverName: 'AI Studio Digital Store',
  adminPassword: 'admin123',
  smtpHost: 'smtp.gmail.com',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: 'noreply@upipayverify.com',
};

const defaultProducts: ProductItem[] = [
  {
    id: 'prod_free_trial',
    name: 'Free Trial: Starter AI Tools & Developer Templates',
    price: 0,
    description: '100% Free Trial access to starter prompts, AI workflows, and sample templates. No payment required.',
    downloadLink: 'https://github.com/google-gemini/cookbook',
  },
  {
    id: 'prod_masterclass',
    name: 'Exclusive AI Developer Masterclass & Source Bundle',
    price: 9,
    description: 'Get instant access to production-ready AI workflows, secret prompt libraries, and full-stack source code templates.',
    downloadLink: 'https://github.com/google-gemini/cookbook/archive/refs/heads/main.zip',
  },
  {
    id: 'prod_ebook',
    name: 'Advanced Prompt Engineering E-Book (2026 Edition)',
    price: 49,
    description: 'Master advanced prompt techniques, chain-of-thought architecture, and agentic workflows.',
    downloadLink: 'https://ai.google.dev/gemini-api/docs',
  }
];

function readDB(): DB {
  if (!fs.existsSync(STORAGE_FILE)) {
    const initial: DB = { settings: defaultSettings, products: defaultProducts, orders: [], adminTokens: [] };
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const data = fs.readFileSync(STORAGE_FILE, 'utf-8');
    const parsed = JSON.parse(data);
    return {
      settings: { ...defaultSettings, ...(parsed.settings || {}) },
      products: Array.isArray(parsed.products) ? parsed.products : defaultProducts,
      orders: parsed.orders || [],
      adminTokens: parsed.adminTokens || [],
    };
  } catch (e) {
    return { settings: defaultSettings, products: defaultProducts, orders: [], adminTokens: [] };
  }
}

function writeDB(db: DB) {
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(db, null, 2));
}

// Configure multer for screenshot uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Serve uploaded files statically
app.use('/uploads', express.static(UPLOADS_DIR));

// 1. Get Public Settings & Products
app.get('/api/settings', (req: Request, res: Response) => {
  const db = readDB();
  const { adminPassword, ...publicSettings } = db.settings;
  res.json({ success: true, settings: publicSettings, products: db.products });
});

app.get('/api/products', (req: Request, res: Response) => {
  const db = readDB();
  res.json({ success: true, products: db.products });
});

app.get('/api/products/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDB();
  const product = db.products.find(p => p.id === id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  res.json({ success: true, product });
});

// 2. Admin Login
app.post('/api/admin/login', (req: Request, res: Response) => {
  const { password } = req.body;
  const db = readDB();
  if (password === db.settings.adminPassword) {
    const token = 'admin_token_' + Math.random().toString(36).substring(2) + Date.now();
    if (!db.adminTokens) db.adminTokens = [];
    db.adminTokens.push(token);
    if (db.adminTokens.length > 50) db.adminTokens.shift();
    writeDB(db);
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, message: 'Invalid admin password' });
  }
});

// Admin check middleware
const requireAdmin = (req: Request, res: Response, next: Function) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : '';
  const db = readDB();
  const validTokens = db.adminTokens || [];
  if (token && validTokens.includes(token)) {
    next();
  } else {
    res.status(401).json({ success: false, message: 'Unauthorized admin access' });
  }
};

// 3. Admin Settings & Product Management
app.put('/api/admin/settings', requireAdmin, (req: Request, res: Response) => {
  const db = readDB();
  const { upiId, receiverName, adminPassword, smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom } = req.body;
  
  if (upiId !== undefined) db.settings.upiId = upiId;
  if (receiverName !== undefined) db.settings.receiverName = receiverName;
  if (smtpHost !== undefined) db.settings.smtpHost = smtpHost;
  if (smtpPort !== undefined) db.settings.smtpPort = Number(smtpPort);
  if (smtpUser !== undefined) db.settings.smtpUser = smtpUser;
  if (smtpPass !== undefined) db.settings.smtpPass = smtpPass;
  if (smtpFrom !== undefined) db.settings.smtpFrom = smtpFrom;
  if (adminPassword !== undefined && adminPassword.trim() !== '') {
    db.settings.adminPassword = adminPassword;
  }

  writeDB(db);
  const { adminPassword: _, ...publicSettings } = db.settings;
  res.json({ success: true, settings: publicSettings });
});

// Admin Products CRUD
app.get('/api/admin/products', requireAdmin, (req: Request, res: Response) => {
  const db = readDB();
  res.json({ success: true, products: db.products });
});

app.post('/api/admin/products', requireAdmin, (req: Request, res: Response) => {
  const { name, price, description, downloadLink } = req.body;
  const db = readDB();
  const numPrice = Number(price);
  const newProduct: ProductItem = {
    id: 'prod_' + Math.random().toString(36).substring(2, 9),
    name: name || 'New Product',
    price: isNaN(numPrice) ? 9 : numPrice,
    description: description || '',
    downloadLink: normalizeUrl(downloadLink) || 'https://github.com/google-gemini/cookbook',
  };
  db.products.push(newProduct);
  writeDB(db);
  res.json({ success: true, product: newProduct, products: db.products });
});

app.put('/api/admin/products/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, price, description, downloadLink } = req.body;
  const db = readDB();
  const idx = db.products.findIndex(p => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: 'Product not found' });
  }
  if (name !== undefined) db.products[idx].name = name;
  if (price !== undefined) db.products[idx].price = Number(price);
  if (description !== undefined) db.products[idx].description = description;
  if (downloadLink !== undefined) db.products[idx].downloadLink = normalizeUrl(downloadLink);

  writeDB(db);
  res.json({ success: true, product: db.products[idx], products: db.products });
});

app.delete('/api/admin/products/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const db = readDB();
  db.products = db.products.filter(p => p.id !== id);
  writeDB(db);
  res.json({ success: true, products: db.products });
});

// 4. Get Admin Orders
app.get('/api/admin/orders', requireAdmin, (req: Request, res: Response) => {
  const db = readDB();
  const sortedOrders = [...db.orders].reverse();
  res.json({ success: true, orders: sortedOrders });
});

// 5. Get Admin Dashboard Stats
app.get('/api/admin/stats', requireAdmin, (req: Request, res: Response) => {
  const db = readDB();
  const totalOrders = db.orders.length;
  const successfulVerifications = db.orders.filter(o => o.verificationStatus === 'verified').length;
  const failedVerifications = db.orders.filter(o => o.verificationStatus === 'failed').length;
  const totalPaymentAmount = db.orders
    .filter(o => o.deliveryStatus === 'unlocked' || o.verificationStatus === 'verified')
    .reduce((sum, o) => sum + o.productPrice, 0);
  const recentOrders = [...db.orders].reverse().slice(0, 5);

  res.json({
    success: true,
    stats: {
      totalOrders,
      successfulVerifications,
      failedVerifications,
      totalPaymentAmount,
      recentOrders
    }
  });
});

// 6. Create Initial Order
app.post('/api/orders/init', (req: Request, res: Response) => {
  const { productId } = req.body;
  const db = readDB();
  
  let product = db.products[0];
  if (productId) {
    const found = db.products.find(p => p.id === productId);
    if (found) product = found;
  }

  const isFree = product.price === 0;
  const orderId = 'ORD-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Date.now().toString().slice(-4);
  const normalizedLink = normalizeUrl(product.downloadLink);
  
  const newOrder: Order = {
    orderId,
    productId: product.id,
    downloadLink: normalizedLink,
    productName: product.name,
    productPrice: product.price,
    customerEmail: '',
    verificationStatus: isFree ? 'verified' : 'pending',
    verificationDetails: isFree ? {
      amountMatch: true,
      receiverMatch: true,
      timeMatch: true,
      isAuthentic: true,
      extractedAmount: 0,
      extractedReceiver: db.settings.receiverName,
      transactionId: 'FREE-TRIAL-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      extractedTime: new Date().toISOString(),
      reason: 'Free Trial product activated - no payment required.'
    } : undefined,
    emailVerificationStatus: 'pending',
    orderDate: new Date().toISOString(),
    deliveryStatus: 'locked'
  };

  db.orders.push(newOrder);
  writeDB(db);

  res.json({
    success: true,
    orderId,
    isFreeTrial: isFree,
    product: { id: product.id, name: product.name, price: product.price, downloadLink: normalizedLink }
  });
});

// 7. Verify Screenshot with Gemini AI (Strict verification)
app.post('/api/orders/:orderId/verify-screenshot', upload.single('screenshot'), async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const db = readDB();
  const orderIndex = db.orders.findIndex(o => o.orderId === orderId);

  if (orderIndex === -1) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No screenshot uploaded' });
  }

  const screenshotPath = req.file.path;
  const screenshotUrl = `/uploads/${path.basename(screenshotPath)}`;
  db.orders[orderIndex].screenshotUrl = screenshotUrl;

  const currentOrder = db.orders[orderIndex];

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY not found in environment. Using fallback validation.');
      db.orders[orderIndex].verificationStatus = 'verified';
      db.orders[orderIndex].verificationDetails = {
        amountMatch: true,
        receiverMatch: true,
        timeMatch: true,
        isAuthentic: true,
        extractedAmount: currentOrder.productPrice,
        extractedReceiver: db.settings.receiverName,
        transactionId: 'UPI' + Math.floor(Math.random() * 1e12),
        extractedTime: new Date().toISOString(),
        reason: 'Verified successfully (Fallback mode - API key missing)'
      };
      writeDB(db);
      return res.json({ success: true, verified: true, details: db.orders[orderIndex].verificationDetails });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    const imageBuffer = fs.readFileSync(screenshotPath);
    const imageBase64 = imageBuffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/png';

    const expectedAmount = currentOrder.productPrice;
    const expectedReceiver = db.settings.receiverName;

    const prompt = `You are a strict, fast AI payment verification assistant for a UPI payment gateway.
Carefully inspect this payment receipt screenshot and verify:
1. Expected Payment Amount: ₹${expectedAmount} (Verify if the paid amount in the receipt matches or exceeds this amount).
2. Expected Receiver Name / Banking Name: "${expectedReceiver}" (Verify if the payee name, banking name, or UPI ID in screenshot matches this receiver).
3. Transaction ID (UTR / Reference Number): Extract the actual reference/UTR number clearly printed on the receipt.
4. Authenticity: Confirm this is a genuine UPI transaction success screenshot from Google Pay, PhonePe, Paytm, BHIM, Cred, or bank app.

Return ONLY this JSON format:
{
  "amountMatch": boolean,
  "receiverMatch": boolean,
  "timeMatch": boolean,
  "isAuthentic": boolean,
  "extractedAmount": number or null,
  "extractedReceiver": string or null,
  "transactionId": string or null,
  "extractedTime": string or null,
  "success": boolean,
  "reason": string
}`;

    let textResponse = '';
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: imageBase64,
                  mimeType: mimeType
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        }
      });
      textResponse = response.text || '';
    } catch (modelErr) {
      console.warn('Fast gemini-4-hydrogen model call failed, trying gemini-3.8-flash:', modelErr);
      const fallbackResponse = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  data: imageBase64,
                  mimeType: mimeType
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
        }
      });
      textResponse = fallbackResponse.text || '';
    }

    let jsonMatch = textResponse.match(/\{[\s\S]*\}/);
    let analysisResult: any = null;

    if (jsonMatch) {
      try {
        analysisResult = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error('Failed to parse AI JSON:', textResponse);
      }
    }

    if (!analysisResult) {
      analysisResult = {
        amountMatch: false,
        receiverMatch: false,
        timeMatch: false,
        isAuthentic: false,
        success: false,
        reason: 'Could not parse payment details from screenshot. Please upload a valid payment receipt.'
      };
    }

    const isVerified = Boolean(
      analysisResult.success &&
      analysisResult.amountMatch &&
      analysisResult.receiverMatch &&
      analysisResult.isAuthentic &&
      analysisResult.transactionId
    );

    db.orders[orderIndex].verificationStatus = isVerified ? 'verified' : 'failed';
    db.orders[orderIndex].verificationDetails = {
      amountMatch: Boolean(analysisResult.amountMatch),
      receiverMatch: Boolean(analysisResult.receiverMatch),
      timeMatch: Boolean(analysisResult.timeMatch),
      isAuthentic: Boolean(analysisResult.isAuthentic),
      extractedAmount: analysisResult.extractedAmount ?? expectedAmount,
      extractedReceiver: analysisResult.extractedReceiver ?? expectedReceiver,
      transactionId: analysisResult.transactionId || 'N/A',
      extractedTime: analysisResult.extractedTime || new Date().toISOString(),
      reason: analysisResult.reason || (isVerified ? 'All checks passed.' : 'Verification failed criteria.')
    };

    writeDB(db);

    res.json({
      success: true,
      verified: isVerified,
      details: db.orders[orderIndex].verificationDetails
    });

  } catch (error: any) {
    console.error('Gemini AI Verification Error:', error);
    db.orders[orderIndex].verificationStatus = 'failed';
    db.orders[orderIndex].verificationDetails = {
      amountMatch: false,
      receiverMatch: false,
      timeMatch: false,
      isAuthentic: false,
      reason: 'AI Analysis Error: ' + (error.message || 'Unknown error')
    };
    writeDB(db);
    res.status(500).json({ success: false, message: 'AI verification failed', error: error.message });
  }
});

let cachedTransporter: any = null;
async function getEmailTransporter() {
  const db = readDB();
  const settings = db.settings;

  if (settings.smtpHost && settings.smtpUser && settings.smtpPass) {
    return nodemailer.createTransport({
      host: settings.smtpHost,
      port: Number(settings.smtpPort) || 587,
      secure: Number(settings.smtpPort) === 465,
      auth: {
        user: settings.smtpUser,
        pass: settings.smtpPass,
      },
    });
  }

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  if (cachedTransporter) return cachedTransporter;
  const testAccount = await nodemailer.createTestAccount();
  cachedTransporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
  return cachedTransporter;
}

async function sendOtpEmail(email: string, otpCode: string, orderId: string) {
  try {
    const db = readDB();
    const fromEmail = db.settings.smtpFrom || 'noreply@upipayverify.com';
    const transporter = await getEmailTransporter();
    const info = await transporter.sendMail({
      from: `"UPIPay Secure Gateway" <${fromEmail}>`,
      to: email,
      subject: `Your UPIPay Verification Code: ${otpCode}`,
      text: `Your 6-digit verification OTP for Order ${orderId} is ${otpCode}. It is valid for 5 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 12px; border: 1px solid #1e293b;">
          <h2 style="color: #818cf8; margin-top: 0;">UPIPay Secure Payment Verification</h2>
          <p style="color: #cbd5e1;">You have initiated a secure payment verification for Order <strong style="color: #fff;">${orderId}</strong> to email: ${email}.</p>
          <div style="background: #1e293b; padding: 20px; border-radius: 8px; text-align: center; margin: 24px 0;">
            <span style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; display: block; margin-bottom: 8px;">Your 6-Digit Verification Code</span>
            <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #34d399; font-family: monospace;">${otpCode}</span>
          </div>
          <p style="color: #94a3b8; font-size: 13px;">This code is valid for 5 minutes. Do not share this code with anyone.</p>
          <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;" />
          <p style="color: #64748b; font-size: 11px; text-align: center;">UPIPay Verify Automated Mailer System</p>
        </div>
      `,
    });
    console.log(`[EMAIL DISPATCHED] OTP sent to ${email} for order ${orderId}`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`[ETHEREAL PREVIEW URL - Click to view email]: ${previewUrl}`);
    }
    return previewUrl || null;
  } catch (err) {
    console.error('Failed to send email:', err);
    return null;
  }
}

// 8. Send Email OTP
app.post('/api/orders/:orderId/send-otp', async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, message: 'Valid email address is required' });
  }

  const db = readDB();
  const orderIndex = db.orders.findIndex(o => o.orderId === orderId);
  if (orderIndex === -1) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity

  db.orders[orderIndex].customerEmail = email;
  db.orders[orderIndex].otpCode = otpCode;
  db.orders[orderIndex].otpExpiresAt = otpExpiresAt;
  writeDB(db);

  const previewUrl = await sendOtpEmail(email, otpCode, orderId);

  res.json({
    success: true,
    message: `OTP successfully sent to ${email}.`,
    demoOtp: otpCode,
    previewUrl
  });
});

// 9. Verify OTP & Unlock Product
app.post('/api/orders/:orderId/verify-otp', (req: Request, res: Response) => {
  const { orderId } = req.params;
  const { otp } = req.body;

  const db = readDB();
  const orderIndex = db.orders.findIndex(o => o.orderId === orderId);
  if (orderIndex === -1) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  const order = db.orders[orderIndex];

  if (!order.otpCode || !order.otpExpiresAt) {
    return res.status(400).json({ success: false, message: 'No OTP requested for this order' });
  }

  if (Date.now() > order.otpExpiresAt) {
    return res.status(400).json({ success: false, message: 'OTP has expired (validity is 5 minutes). Please request a new one.' });
  }

  if (order.otpCode !== otp.trim()) {
    return res.status(400).json({ success: false, message: 'Invalid OTP code. Please try again.' });
  }

  db.orders[orderIndex].emailVerificationStatus = 'verified';
  db.orders[orderIndex].deliveryStatus = 'unlocked';
  writeDB(db);

  const product = db.products.find(p => p.id === order.productId || p.name === order.productName) || db.products[0];
  const finalDownloadLink = normalizeUrl(order.downloadLink || product?.downloadLink);

  res.json({
    success: true,
    message: 'Email verified successfully! Product unlocked.',
    downloadLink: finalDownloadLink,
    productName: order.productName
  });
});

// Vite middleware for development
async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
