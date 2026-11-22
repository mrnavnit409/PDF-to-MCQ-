import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  QrCode,
  UploadCloud,
  Mail,
  Download,
  Lock,
  Unlock,
  Settings,
  CheckCircle,
  XCircle,
  AlertCircle,
  DollarSign,
  Package,
  BarChart3,
  FileText,
  RefreshCw,
  LogOut,
  Clock,
  Check,
  ExternalLink,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Info,
  Plus,
  Trash2,
  Edit,
  Copy,
  Link as LinkIcon
} from 'lucide-react';
import { PWAInstallButton } from './components/PWAInstallButton';

interface SettingsData {
  upiId: string;
  receiverName: string;
  adminPassword?: string;
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

interface VerificationDetails {
  amountMatch: boolean;
  receiverMatch: boolean;
  timeMatch: boolean;
  isAuthentic: boolean;
  extractedAmount?: number;
  extractedReceiver?: string;
  transactionId?: string;
  extractedTime?: string;
  reason: string;
}

interface OrderItem {
  orderId: string;
  productName: string;
  productPrice: number;
  customerEmail: string;
  screenshotUrl?: string;
  verificationStatus: 'pending' | 'verified' | 'failed';
  verificationDetails?: VerificationDetails;
  emailVerificationStatus: 'pending' | 'verified';
  orderDate: string;
  deliveryStatus: 'locked' | 'unlocked';
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

function getProductParamFromUrl(): string | null {
  const searchParams = new URLSearchParams(window.location.search);
  let param = searchParams.get('productId') || searchParams.get('gateway') || searchParams.get('product') || searchParams.get('p') || searchParams.get('id');
  if (!param && window.location.hash.includes('?')) {
    const hashQuery = window.location.hash.substring(window.location.hash.indexOf('?') + 1);
    const hashParams = new URLSearchParams(hashQuery);
    param = hashParams.get('productId') || hashParams.get('gateway') || hashParams.get('product') || hashParams.get('p') || hashParams.get('id');
  }
  return param;
}

function findMatchingProduct(products: ProductItem[], param: string | null): ProductItem | null {
  if (!param) return null;
  const pLower = param.toLowerCase().trim();
  let found = products.find(p => p.id.toLowerCase() === pLower);
  if (found) return found;
  if (pLower === 'free-trial' || pLower === 'freetrial' || pLower === 'free' || pLower === 'trial') {
    found = products.find(p => p.price === 0 || p.id.toLowerCase().includes('free'));
    if (found) return found;
  }
  found = products.find(p => p.id.toLowerCase().includes(pLower));
  if (found) return found;
  found = products.find(p => p.name.toLowerCase().includes(pLower));
  if (found) return found;
  return null;
}

async function compressImageForUpload(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.type.includes('svg')) {
      return resolve(file);
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1200;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            resolve(blob || file);
          },
          'image/jpeg',
          0.85
        );
      } else {
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'checkout' | 'admin'>('checkout');
  
  // Product & Settings state
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [currentProduct, setCurrentProduct] = useState<ProductItem | null>(null);
  const [gatewayParamMatched, setGatewayParamMatched] = useState<string | null>(null);
  const [settings, setSettings] = useState<SettingsData>({
    upiId: 'merchant.upi@okhdfcbank',
    receiverName: 'AI Studio Digital Store',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: 'noreply@upipayverify.com'
  });

  const [loadingSettings, setLoadingSettings] = useState(true);

  // Checkout flow state
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ verified: boolean; details: VerificationDetails } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Email OTP state
  const [email, setEmail] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [demoOtp, setDemoOtp] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState<boolean>(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [downloadLink, setDownloadLink] = useState<string | null>(null);
  const [copiedDeliveryLink, setCopiedDeliveryLink] = useState(false);
  const [copiedAdminLinkKey, setCopiedAdminLinkKey] = useState<string | null>(null);

  // Admin state
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminLoginError, setAdminLoginError] = useState('');
  const [adminToken, setAdminToken] = useState(localStorage.getItem('admin_token') || '');
  const [adminSubTab, setAdminSubTab] = useState<'dashboard' | 'orders' | 'products' | 'upi' | 'smtp' | 'verifications'>('dashboard');
  const [adminOrders, setAdminOrders] = useState<OrderItem[]>([]);
  const [adminStats, setAdminStats] = useState({
    totalOrders: 0,
    successfulVerifications: 0,
    failedVerifications: 0,
    totalPaymentAmount: 0,
    recentOrders: []
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');

  // Editable Admin Form State
  const [editUpiSettings, setEditUpiSettings] = useState<SettingsData>(settings);
  const [newProductForm, setNewProductForm] = useState({ name: '', price: 9, description: '', downloadLink: '' });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductForm, setEditProductForm] = useState<ProductItem>({ id: '', name: '', price: 9, description: '', downloadLink: '' });

  useEffect(() => {
    fetchInitialData();
    if (adminToken) {
      setIsAdminLoggedIn(true);
      fetchAdminData(adminToken);
    }
  }, [adminToken]);

  const fetchInitialData = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
        setEditUpiSettings(data.settings);
        if (data.products && data.products.length > 0) {
          setProducts(data.products);
          
          // Check URL query param for productId
          const params = new URLSearchParams(window.location.search);
          const productIdParam = params.get('productId');
          const matched = productIdParam ? data.products.find((p: ProductItem) => p.id === productIdParam) : null;
          setCurrentProduct(matched || data.products[0]);
        }
      }
    } catch (e) {
      console.error('Failed to fetch initial data', e);
    } finally {
      setLoadingSettings(false);
    }
  };

  const fetchAdminData = async (tokenOverride?: string) => {
    const token = tokenOverride || adminToken;
    if (!token) return;
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [ordersRes, statsRes, prodRes] = await Promise.all([
        fetch('/api/admin/orders', { headers }),
        fetch('/api/admin/stats', { headers }),
        fetch('/api/admin/products', { headers })
      ]);

      if (ordersRes.status === 401 || statsRes.status === 401 || prodRes.status === 401) {
        localStorage.removeItem('admin_token');
        setAdminToken('');
        setIsAdminLoggedIn(false);
        return;
      }

      const ordersData = await ordersRes.json();
      const statsData = await statsRes.json();
      const prodData = await prodRes.json();

      if (ordersData.success) setAdminOrders(ordersData.orders);
      if (statsData.success) setAdminStats(statsData.stats);
      if (prodData.success) setProducts(prodData.products);
    } catch (e) {
      console.error('Failed to fetch admin data', e);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminLoginError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPasswordInput })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('admin_token', data.token);
        setAdminToken(data.token);
        setIsAdminLoggedIn(true);
        setAdminPasswordInput('');
        fetchAdminData(data.token);
      } else {
        setAdminLoginError(data.message || 'Invalid password');
      }
    } catch (e) {
      setAdminLoginError('Login request failed');
    }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('admin_token');
    setAdminToken('');
    setIsAdminLoggedIn(false);
    setActiveTab('checkout');
  };

  const handleSaveUpiSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMessage('');
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify(editUpiSettings)
      });

      if (res.status === 401) {
        localStorage.removeItem('admin_token');
        setAdminToken('');
        setIsAdminLoggedIn(false);
        setSettingsMessage('Session expired. Please log in again.');
        return;
      }

      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
        setEditUpiSettings(data.settings);
        setSettingsMessage('Settings updated successfully!');
        setTimeout(() => setSettingsMessage(''), 4000);
      } else {
        setSettingsMessage(data.message || 'Failed to update settings');
      }
    } catch (e) {
      setSettingsMessage('Error updating settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMessage('');
    try {
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify(newProductForm)
      });
      const data = await res.json();
      if (data.success) {
        setProducts(data.products);
        setNewProductForm({ name: '', price: 9, description: '', downloadLink: '' });
        setSettingsMessage('Product created successfully!');
        setTimeout(() => setSettingsMessage(''), 4000);
      } else {
        setSettingsMessage('Failed to create product');
      }
    } catch (e) {
      setSettingsMessage('Error creating product');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProductId) return;
    setSavingSettings(true);
    setSettingsMessage('');
    try {
      const res = await fetch(`/api/admin/products/${editingProductId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify(editProductForm)
      });
      const data = await res.json();
      if (data.success) {
        setProducts(data.products);
        setEditingProductId(null);
        setSettingsMessage('Product updated successfully!');
        setTimeout(() => setSettingsMessage(''), 4000);
      } else {
        setSettingsMessage('Failed to update product');
      }
    } catch (e) {
      setSettingsMessage('Error updating product');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.status === 401) {
        localStorage.removeItem('admin_token');
        setAdminToken('');
        setIsAdminLoggedIn(false);
        alert('Session expired. Please log in again.');
        return;
      }
      const data = await res.json();
      if (data.success) {
        setProducts(data.products);
      } else {
        alert(data.message || 'Failed to delete product');
      }
    } catch (e) {
      alert('Failed to delete product');
    }
  };

  // Step 1: Initialize Order & Go to QR Payment (or direct to OTP for Free Trial)
  const startCheckout = async () => {
    try {
      const res = await fetch('/api/orders/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: activeProduct.id })
      });
      const data = await res.json();
      if (data.success) {
        setOrderId(data.orderId);
        if (data.isFreeTrial || activeProduct.price === 0) {
          setVerificationResult({
            verified: true,
            details: {
              amountMatch: true,
              receiverMatch: true,
              timeMatch: true,
              isAuthentic: true,
              extractedAmount: 0,
              extractedReceiver: settings.receiverName,
              transactionId: 'FREE-TRIAL-' + data.orderId,
              reason: 'Free Trial product activated - no payment required.'
            }
          });
          setCurrentStep(4);
        } else {
          setCurrentStep(2);
        }
      }
    } catch (e) {
      alert('Failed to initialize order');
    }
  };

  // Step 3: Handle Screenshot Upload and AI Verification
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
      setUploadError(null);
    }
  };

  const verifyScreenshot = async () => {
    if (!selectedFile || !orderId) return;
    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('screenshot', selectedFile);

    try {
      const res = await fetch(`/api/orders/${orderId}/verify-screenshot`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setVerificationResult({ verified: data.verified, details: data.details });
        if (data.verified) {
          // Success! Next step available
        } else {
          setUploadError(data.details.reason || 'AI verification failed. Please check payment amount and receiver name.');
        }
      } else {
        setUploadError(data.message || 'Verification failed');
      }
    } catch (e) {
      setUploadError('Network error during AI verification');
    } finally {
      setIsUploading(false);
    }
  };

  // Step 4: Send OTP
  const sendOtp = async () => {
    if (!email || !email.includes('@')) {
      setOtpError('Please enter a valid email address');
      return;
    }
    setIsSendingOtp(true);
    setOtpError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (data.success) {
        if (data.demoOtp) {
          setDemoOtp(data.demoOtp);
        }
        if (data.previewUrl) {
          setPreviewUrl(data.previewUrl);
        }
      } else {
        setOtpError(data.message || 'Failed to send OTP');
      }
    } catch (e) {
      setOtpError('Failed to send OTP request');
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Verify OTP
  const verifyOtp = async () => {
    if (!otpCode || otpCode.length !== 6) {
      setOtpError('Please enter the 6-digit verification code');
      return;
    }
    setIsVerifyingOtp(true);
    setOtpError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp: otpCode })
      });
      const data = await res.json();
      if (data.success) {
        setDownloadLink(data.downloadLink);
        setCurrentStep(5); // Product Delivery
      } else {
        setOtpError(data.message || 'Invalid verification code');
      }
    } catch (e) {
      setOtpError('Verification failed');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const activeProduct = currentProduct || products[0] || {
    id: 'default',
    name: 'Exclusive AI Developer Masterclass & Source Bundle',
    price: 9,
    description: 'Get instant access to production-ready AI workflows, secret prompt libraries, and full-stack source code templates.',
    downloadLink: 'https://github.com/google/gemini-cookbook'
  };

  // UPI QR Code URI Generator
  const upiUri = `upi://pay?pa=${encodeURIComponent(settings.upiId)}&pn=${encodeURIComponent(settings.receiverName)}&am=${activeProduct.price}&cu=INR&tn=${encodeURIComponent(activeProduct.name)}`;
  const qrCodeImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUri)}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-955/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('checkout')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-gradient-to-r from-white via-slate-200 to-indigo-300 bg-clip-text text-transparent">
                UPIPay Verify
              </h1>
              <p className="text-xs text-slate-400">Secure AI Payment Gateway</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setActiveTab('checkout')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'checkout'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              Checkout Store
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 ${
                activeTab === 'admin'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Admin Portal</span>
            </button>
            <PWAInstallButton />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'checkout' ? (
          <div className="max-w-3xl mx-auto space-y-8">
            {/* Step Progress Bar */}
            <div className="bg-slate-900/80 border border-slate-800 p-4 sm:p-6 rounded-2xl shadow-xl">
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { step: 1, label: 'Payment' },
                  { step: 2, label: 'QR Scan' },
                  { step: 3, label: 'AI Verify' },
                  { step: 4, label: 'Email OTP & Delivery' }
                ].map((s) => {
                  const isActive = currentStep === s.step || (s.step === 4 && currentStep === 5);
                  const isCompleted = currentStep > s.step;
                  return (
                    <div key={s.step} className="flex flex-col items-center">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold mb-2 transition-all ${
                          isCompleted
                            ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                            : isActive
                            ? 'bg-indigo-600 text-white ring-4 ring-indigo-600/20 shadow-lg shadow-indigo-600/30'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {isCompleted ? <Check className="w-5 h-5" /> : s.step}
                      </div>
                      <span className={`text-xs font-medium hidden sm:block ${isActive ? 'text-indigo-400 font-semibold' : 'text-slate-400'}`}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Step 1: Product Payment Page */}
            {currentStep === 1 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="space-y-6 relative z-10">
                  <div className="inline-flex items-center space-x-2 bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-full text-xs font-semibold border border-indigo-500/20">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{activeProduct.price === 0 ? '🎁 Free Trial Access' : 'Instant Digital Delivery'}</span>
                  </div>

                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                    {activeProduct.name}
                  </h2>

                  <p className="text-slate-300 text-base leading-relaxed">
                    {activeProduct.description}
                  </p>

                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-6 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-400 uppercase tracking-wider block mb-1">Total Price</span>
                      {activeProduct.price === 0 ? (
                        <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 flex items-center">
                          <span>FREE TRIAL</span>
                          <span className="text-xs text-emerald-300 font-semibold ml-2 bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">₹0 (Free Access)</span>
                        </div>
                      ) : (
                        <div className="text-3xl sm:text-4xl font-extrabold text-emerald-400 flex items-center">
                          <span>₹{activeProduct.price}</span>
                          <span className="text-xs text-slate-400 font-normal ml-2 bg-slate-800 px-2 py-0.5 rounded">Inclusive of all taxes</span>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block mb-1">Receiver</span>
                      <span className="text-sm font-medium text-slate-200">{settings.receiverName}</span>
                    </div>
                  </div>

                  <button
                    onClick={startCheckout}
                    className={`w-full py-4 px-8 font-bold rounded-xl shadow-lg flex items-center justify-center space-x-3 transition-all transform active:scale-[0.99] text-white ${
                      activeProduct.price === 0
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/30'
                        : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 shadow-indigo-600/30'
                    }`}
                  >
                    <span>{activeProduct.price === 0 ? 'Claim Free Trial (Instant Access)' : `Proceed to Pay ₹${activeProduct.price}`}</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>

                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-800/80 text-center text-xs text-slate-400">
                    <div className="flex flex-col items-center space-y-1">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>{activeProduct.price === 0 ? '100% Free Verification' : 'AI Screenshot Verification'}</span>
                    </div>
                    <div className="flex flex-col items-center space-y-1">
                      <Clock className="w-4 h-4 text-indigo-400" />
                      <span>Instant Unlock</span>
                    </div>
                    <div className="flex flex-col items-center space-y-1">
                      <Lock className="w-4 h-4 text-violet-400" />
                      <span>{activeProduct.price === 0 ? 'No Payment Needed' : 'Secure UPI Gateway'}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: QR Code Payment */}
            {currentStep === 2 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                      <QrCode className="w-6 h-6 text-indigo-400" />
                      <span>Scan & Pay via UPI App</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">Order ID: <span className="font-mono text-indigo-300">{orderId}</span></p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Amount</span>
                    <span className="text-2xl font-bold text-emerald-400">₹{activeProduct.price}</span>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-6 bg-slate-950/60 p-6 rounded-xl border border-slate-800">
                  <div className="bg-white p-4 rounded-xl shadow-lg flex flex-col items-center justify-center">
                    <img src={qrCodeImageUrl} alt="UPI QR Code" className="w-48 h-48 object-contain" />
                    <span className="text-xs text-slate-700 font-medium mt-2">Scan with GPay / PhonePe / Paytm</span>
                  </div>
                  <div className="space-y-4 flex-1 text-sm text-slate-300">
                    <div className="bg-slate-900 p-4 rounded-lg border border-slate-800 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">UPI ID:</span>
                        <span className="font-mono text-indigo-300 select-all font-semibold">{settings.upiId}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Receiver Name:</span>
                        <span className="font-semibold text-white">{settings.receiverName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Amount:</span>
                        <span className="font-semibold text-emerald-400">₹{activeProduct.price}</span>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-slate-400">
                      <p className="font-semibold text-slate-300 flex items-center space-x-1">
                        <Info className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Payment Instructions:</span>
                      </p>
                      <ul className="list-disc list-inside space-y-1">
                        <li>Open any UPI payment app on your phone.</li>
                        <li>Scan the QR code or pay to the UPI ID above.</li>
                        <li>Complete the payment of exactly ₹{activeProduct.price}.</li>
                        <li>Take a clear screenshot of the payment success screen.</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl transition-all text-sm"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center space-x-2 transition-all"
                  >
                    <span>I Have Paid - Upload Screenshot</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Payment Screenshot Upload & AI Verification */}
            {currentStep === 3 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                    <UploadCloud className="w-6 h-6 text-indigo-400" />
                    <span>Upload Payment Screenshot for AI Verification</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">Our strict AI verifies transaction amount, exact receiver name, and UTR number from the uploaded receipt.</p>
                </div>

                <div className="space-y-4">
                  {!filePreview ? (
                    <label className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer bg-slate-950/40 transition-all group">
                      <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <UploadCloud className="w-8 h-8 text-indigo-400" />
                      </div>
                      <span className="text-sm font-medium text-slate-200">Click to upload or drag & drop payment screenshot</span>
                      <span className="text-xs text-slate-500 mt-1">PNG, JPG, JPEG up to 10MB</span>
                      <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                    </label>
                  ) : (
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center gap-4">
                      <img src={filePreview} alt="Screenshot Preview" className="w-32 h-32 object-cover rounded-lg border border-slate-700" />
                      <div className="flex-1 space-y-1 text-center sm:text-left">
                        <p className="text-sm font-medium text-slate-200 truncate">{selectedFile?.name}</p>
                        <p className="text-xs text-slate-400">Ready for strict AI verification</p>
                        <button
                          onClick={() => { setSelectedFile(null); setFilePreview(null); setVerificationResult(null); }}
                          className="text-xs text-indigo-400 hover:text-indigo-300 underline mt-2 inline-block"
                        >
                          Choose different screenshot
                        </button>
                      </div>
                    </div>
                  )}

                  {uploadError && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl text-sm flex items-start space-x-3">
                      <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">AI Verification Failed</p>
                        <p className="text-xs mt-1">{uploadError}</p>
                      </div>
                    </div>
                  )}

                  {verificationResult && verificationResult.verified && (
                    <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl space-y-3">
                      <div className="flex items-center space-x-3">
                        <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0" />
                        <div>
                          <p className="font-bold text-white">Payment Screenshot Verified Successfully!</p>
                          <p className="text-xs text-emerald-300">Amount, receiver name, and transaction ID successfully verified against order requirements.</p>
                        </div>
                      </div>

                      <div className="bg-slate-950/60 p-3 rounded-lg text-xs space-y-1 text-slate-300 font-mono">
                        <div>Transaction ID (UTR): {verificationResult.details.transactionId}</div>
                        <div>Extracted Amount: ₹{verificationResult.details.extractedAmount}</div>
                        <div>Receiver / Payee: {verificationResult.details.extractedReceiver}</div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4">
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl transition-all text-sm"
                  >
                    Back to QR
                  </button>

                  {!verificationResult?.verified ? (
                    <button
                      onClick={verifyScreenshot}
                      disabled={!selectedFile || isUploading}
                      className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center space-x-2 transition-all"
                    >
                      {isUploading ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          <span>AI Analyzing Receipt...</span>
                        </>
                      ) : (
                        <>
                          <span>Verify with AI</span>
                          <ArrowRight className="w-5 h-5" />
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => setCurrentStep(4)}
                      className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 flex items-center space-x-2 transition-all"
                    >
                      <span>Proceed to Email Verification</span>
                      <ArrowRight className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Email Verification & OTP */}
            {currentStep === 4 && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                    <Mail className="w-6 h-6 text-indigo-400" />
                    <span>{activeProduct.price === 0 ? 'Free Trial - Email Verification' : 'Email OTP Verification'}</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {activeProduct.price === 0
                      ? 'Enter your email address to receive your 6-digit code and instantly unlock your Free Trial download.'
                      : 'Enter your email address to receive a secure 6-digit verification code.'}
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Customer Email Address</label>
                    <div className="flex gap-3">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your.email@example.com"
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-sm"
                      />
                      <button
                        onClick={sendOtp}
                        disabled={isSendingOtp || !email}
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all shrink-0"
                      >
                        {isSendingOtp ? 'Sending...' : 'Send OTP'}
                      </button>
                    </div>
                  </div>

                  {demoOtp && (
                    <div className="bg-indigo-500/10 border border-indigo-500/30 p-4 rounded-xl text-xs space-y-2">
                      <p className="font-semibold text-indigo-300 flex items-center justify-between">
                        <span>🔑 Sent to {email}:</span>
                        <span className="font-mono text-emerald-400 text-sm font-bold px-2 py-0.5 bg-slate-950 rounded">{demoOtp}</span>
                      </p>
                      {previewUrl && (
                        <div className="pt-2 border-t border-indigo-500/20">
                          <a
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-1.5 text-indigo-300 hover:text-white underline font-medium"
                          >
                            <span>📥 Open Sent Email Inbox Preview (Ethereal)</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Enter 6-Digit OTP Code</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="123456"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white tracking-widest text-center text-xl placeholder-slate-600 focus:outline-none focus:border-indigo-500 font-mono"
                    />
                    <p className="text-xs text-slate-500 mt-1.5 flex items-center justify-between">
                      <span>OTP validity: 5 minutes</span>
                      <span>Resend limit: 3 attempts</span>
                    </p>
                  </div>

                  {otpError && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl text-sm flex items-start space-x-3">
                      <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      <p>{otpError}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4">
                  <button
                    onClick={() => setCurrentStep(activeProduct.price === 0 ? 1 : 3)}
                    className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium rounded-xl transition-all text-sm"
                  >
                    Back
                  </button>
                  <button
                    onClick={verifyOtp}
                    disabled={isVerifyingOtp || otpCode.length !== 6}
                    className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 flex items-center space-x-2 transition-all"
                  >
                    {isVerifyingOtp ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>Verifying OTP...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify & Unlock Product</span>
                        <Unlock className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Product Delivery */}
            {currentStep === 5 && (
              <div className="bg-slate-900 border border-emerald-500/40 rounded-2xl p-8 shadow-2xl text-center space-y-6 relative overflow-hidden">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

                <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20">
                  <CheckCircle className="w-10 h-10 text-emerald-400" />
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                    Payment & Email Verified
                  </span>
                  <h2 className="text-3xl font-extrabold text-white">Your Product is Unlocked!</h2>
                  <p className="text-slate-300 text-sm max-w-md mx-auto">
                    Thank you for your purchase. You can now download your product files or access your masterclass bundle immediately.
                  </p>
                </div>

                <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 max-w-lg mx-auto space-y-4">
                  <div className="flex items-center justify-between text-left">
                    <div>
                      <h4 className="text-sm font-bold text-white">{activeProduct.name}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">Order ID: {orderId}</p>
                    </div>
                    <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded font-medium">Unlocked</span>
                  </div>

                  <a
                    href={downloadLink || activeProduct.downloadLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center space-x-3 transition-all"
                  >
                    <Download className="w-5 h-5" />
                    <span>Download Product Files / Access Link</span>
                    <ExternalLink className="w-4 h-4 ml-1" />
                  </a>
                </div>

                <div className="pt-4">
                  <button
                    onClick={() => {
                      setCurrentStep(1);
                      setOrderId(null);
                      setSelectedFile(null);
                      setFilePreview(null);
                      setVerificationResult(null);
                      setEmail('');
                      setOtpCode('');
                      setDemoOtp(null);
                      setPreviewUrl(null);
                    }}
                    className="text-xs text-slate-400 hover:text-white underline transition-colors"
                  >
                    Make another purchase
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Admin Panel */
          <div className="space-y-6">
            {!isAdminLoggedIn ? (
              <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
                <div className="text-center space-y-2">
                  <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/30 rounded-full flex items-center justify-center mx-auto">
                    <Lock className="w-6 h-6 text-indigo-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white">Admin Portal Login</h2>
                  <p className="text-xs text-slate-400">Enter secure password to access admin dashboard</p>
                </div>

                <form onSubmit={handleAdminLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Admin Password</label>
                    <input
                      type="password"
                      value={adminPasswordInput}
                      onChange={(e) => setAdminPasswordInput(e.target.value)}
                      placeholder="Enter password (default: admin123)"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-sm"
                    />
                  </div>

                  {adminLoginError && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-xs">
                      {adminLoginError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition-all text-sm"
                  >
                    Login to Dashboard
                  </button>
                </form>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Admin Header Bar */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                      <BarChart3 className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white">Admin Control Dashboard</h2>
                      <p className="text-xs text-slate-400">Manage products, UPI settings, and order verifications</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
                    <button
                      onClick={() => fetchAdminData()}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium flex items-center space-x-2 transition-all"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Refresh</span>
                    </button>
                    <button
                      onClick={handleAdminLogout}
                      className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-xs font-medium flex items-center space-x-2 transition-all border border-red-500/20"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>

                {/* Admin Sub Nav Tabs */}
                <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-4">
                  {[
                    { id: 'dashboard', label: 'Dashboard Stats', icon: BarChart3 },
                    { id: 'orders', label: 'Order Management', icon: Package },
                    { id: 'products', label: 'Product Gateway Links', icon: FileText },
                    { id: 'upi', label: 'UPI Payment Settings', icon: QrCode },
                    { id: 'smtp', label: 'Email & SMTP Settings', icon: Mail },
                    { id: 'verifications', label: 'AI Verification Logs', icon: ShieldCheck }
                  ].map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setAdminSubTab(tab.id as any)}
                        className={`px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center space-x-2 transition-all ${
                          adminSubTab === tab.id
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                            : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-850 border border-slate-800'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Tab 1: Dashboard Stats */}
                {adminSubTab === 'dashboard' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-2">
                        <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Orders</span>
                        <div className="text-3xl font-extrabold text-white">{adminStats.totalOrders}</div>
                        <p className="text-xs text-slate-500">All time payment attempts</p>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-2">
                        <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Successful Verifications</span>
                        <div className="text-3xl font-extrabold text-emerald-400">{adminStats.successfulVerifications}</div>
                        <p className="text-xs text-slate-500">Passed AI & OTP checks</p>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-2">
                        <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Failed Verifications</span>
                        <div className="text-3xl font-extrabold text-red-400">{adminStats.failedVerifications}</div>
                        <p className="text-xs text-slate-500">Rejected by AI scanner</p>
                      </div>

                      <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl space-y-2">
                        <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Total Revenue</span>
                        <div className="text-3xl font-extrabold text-indigo-400">₹{adminStats.totalPaymentAmount}</div>
                        <p className="text-xs text-slate-500">Completed payments</p>
                      </div>
                    </div>

                    {/* Recent Orders */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                      <h3 className="text-lg font-bold text-white">Recent Orders</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400">
                              <th className="pb-3 font-semibold">Order ID</th>
                              <th className="pb-3 font-semibold">Product</th>
                              <th className="pb-3 font-semibold">Price</th>
                              <th className="pb-3 font-semibold">Email</th>
                              <th className="pb-3 font-semibold">AI Status</th>
                              <th className="pb-3 font-semibold">Delivery</th>
                              <th className="pb-3 font-semibold">Date & Time</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {adminOrders.slice(0, 5).map((o) => (
                              <tr key={o.orderId} className="hover:bg-slate-850/50">
                                <td className="py-3 font-mono text-indigo-300 font-semibold">{o.orderId}</td>
                                <td className="py-3 text-slate-200 max-w-xs truncate">{o.productName}</td>
                                <td className="py-3 font-semibold text-emerald-400">₹{o.productPrice}</td>
                                <td className="py-3 text-slate-300">{o.customerEmail || 'N/A'}</td>
                                <td className="py-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    o.verificationStatus === 'verified' ? 'bg-emerald-500/20 text-emerald-400' :
                                    o.verificationStatus === 'failed' ? 'bg-red-500/20 text-red-400' :
                                    'bg-amber-500/20 text-amber-400'
                                  }`}>
                                    {o.verificationStatus}
                                  </span>
                                </td>
                                <td className="py-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    o.deliveryStatus === 'unlocked' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                                  }`}>
                                    {o.deliveryStatus}
                                  </span>
                                </td>
                                <td className="py-3 text-slate-400">{new Date(o.orderDate).toLocaleString()}</td>
                              </tr>
                            ))}
                            {adminOrders.length === 0 && (
                              <tr>
                                <td colSpan={7} className="py-8 text-center text-slate-500">No orders recorded yet.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Order Management */}
                {adminSubTab === 'orders' && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <h3 className="text-lg font-bold text-white">All Customer Orders & Transactions</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400">
                            <th className="pb-3 font-semibold">Order ID</th>
                            <th className="pb-3 font-semibold">Product Name</th>
                            <th className="pb-3 font-semibold">Price</th>
                            <th className="pb-3 font-semibold">Customer Email</th>
                            <th className="pb-3 font-semibold">Screenshot</th>
                            <th className="pb-3 font-semibold">AI Verification</th>
                            <th className="pb-3 font-semibold">Email OTP Status</th>
                            <th className="pb-3 font-semibold">Delivery Status</th>
                            <th className="pb-3 font-semibold">Date & Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {adminOrders.map((o) => (
                            <tr key={o.orderId} className="hover:bg-slate-850/50">
                              <td className="py-3 font-mono text-indigo-300 font-semibold">{o.orderId}</td>
                              <td className="py-3 text-slate-200">{o.productName}</td>
                              <td className="py-3 font-semibold text-emerald-400">₹{o.productPrice}</td>
                              <td className="py-3 text-slate-300">{o.customerEmail || 'Pending'}</td>
                              <td className="py-3">
                                {o.screenshotUrl ? (
                                  <a href={o.screenshotUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline flex items-center space-x-1">
                                    <span>View</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : (
                                  <span className="text-slate-500">None</span>
                                )}
                              </td>
                              <td className="py-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  o.verificationStatus === 'verified' ? 'bg-emerald-500/20 text-emerald-400' :
                                  o.verificationStatus === 'failed' ? 'bg-red-500/20 text-red-400' :
                                  'bg-amber-500/20 text-amber-400'
                                }`}>
                                  {o.verificationStatus}
                                </span>
                              </td>
                              <td className="py-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  o.emailVerificationStatus === 'verified' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                                }`}>
                                  {o.emailVerificationStatus}
                                </span>
                              </td>
                              <td className="py-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  o.deliveryStatus === 'unlocked' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                                }`}>
                                  {o.deliveryStatus}
                                </span>
                              </td>
                              <td className="py-3 text-slate-400">{new Date(o.orderDate).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tab 3: Multi-Product Gateway Links */}
                {adminSubTab === 'products' && (
                  <div className="space-y-6 max-w-4xl mx-auto">
                    {/* Shareable Public URLs & Free Trial Links */}
                    <div className="bg-gradient-to-r from-indigo-950/60 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-xl space-y-4">
                      <div className="flex items-center space-x-2 text-indigo-400">
                        <Sparkles className="w-5 h-5" />
                        <h3 className="text-base font-bold text-white">Public Gateway Links & Free Trial Access</h3>
                      </div>
                      <p className="text-xs text-slate-300">
                        Anyone in the public can access these links directly on mobile or PC without logging in. Share these links with your users or customers:
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-slate-950/80 border border-emerald-500/30 p-3.5 rounded-xl flex items-center justify-between gap-2">
                          <div className="overflow-hidden">
                            <span className="text-xs font-bold text-emerald-400 block">🎁 Free Trial Public Gateway (₹0)</span>
                            <span className="text-[10px] text-slate-400 font-mono truncate block">{window.location.origin}/?productId=prod_free_trial</span>
                          </div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/?productId=prod_free_trial`);
                              alert('Free Trial public link copied to clipboard!');
                            }}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shrink-0 flex items-center space-x-1 shadow-md transition-all"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Link</span>
                          </button>
                        </div>

                        <div className="bg-slate-950/80 border border-indigo-500/30 p-3.5 rounded-xl flex items-center justify-between gap-2">
                          <div className="overflow-hidden">
                            <span className="text-xs font-bold text-indigo-400 block">🌐 Main Store Public Gateway</span>
                            <span className="text-[10px] text-slate-400 font-mono truncate block">{window.location.origin}/</span>
                          </div>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/`);
                              alert('Main Store public link copied to clipboard!');
                            }}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shrink-0 flex items-center space-x-1 shadow-md transition-all"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Link</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                      <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                        <Package className="w-5 h-5 text-indigo-400" />
                        <span>Create & Manage Products & Payment Gateway Links</span>
                      </h3>
                      <p className="text-xs text-slate-400">Create multiple product gateways (set Price to 0 for Free Trial). Each product gets a unique shareable link (e.g., <code className="text-indigo-300">?productId=...</code>). When customers open that link, only that specific product checkout opens.</p>

                      <form onSubmit={handleCreateProduct} className="space-y-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                        <h4 className="text-sm font-semibold text-white">Add New Product Gateway</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Product Name</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Masterclass Course or Free Trial Pack"
                              value={newProductForm.name}
                              onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Price (₹) — Enter 0 for Free Trial</label>
                            <input
                              type="number"
                              required
                              placeholder="0 for Free Trial, or 9"
                              value={newProductForm.price}
                              onChange={(e) => setNewProductForm({ ...newProductForm, price: Number(e.target.value) })}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Product Description</label>
                          <textarea
                            rows={2}
                            placeholder="Brief description of what customer gets..."
                            value={newProductForm.description}
                            onChange={(e) => setNewProductForm({ ...newProductForm, description: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">Download Link / File URL</label>
                          <input
                            type="text"
                            required
                            placeholder="https://example.com/download/file.zip"
                            value={newProductForm.downloadLink}
                            onChange={(e) => setNewProductForm({ ...newProductForm, downloadLink: e.target.value })}
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={savingSettings}
                          className="py-2.5 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-indigo-600/30 flex items-center space-x-2"
                        >
                          <Plus className="w-4 h-4" />
                          <span>Create Product Gateway</span>
                        </button>
                      </form>
                    </div>

                    {/* Products List & Gateway Links */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                      <h3 className="text-lg font-bold text-white">Active Product Gateways ({products.length})</h3>
                      <div className="space-y-4">
                        {products.map((p) => {
                          const gatewayLink = `${window.location.origin}/?productId=${p.id}`;
                          const isEditing = editingProductId === p.id;

                          return (
                            <div key={p.id} className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                              {!isEditing ? (
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                  <div className="space-y-1">
                                    <div className="flex items-center space-x-2">
                                      <h4 className="font-bold text-white text-base">{p.name}</h4>
                                      {p.price === 0 ? (
                                        <span className="text-xs bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold px-2 py-0.5 rounded">
                                          🎁 Free Trial (₹0)
                                        </span>
                                      ) : (
                                        <span className="text-xs bg-emerald-500/20 text-emerald-400 font-semibold px-2 py-0.5 rounded">₹{p.price}</span>
                                      )}
                                    </div>
                                    <p className="text-xs text-slate-400">{p.description}</p>
                                    <div className="flex items-center space-x-2 pt-1 font-mono text-[11px] text-indigo-300">
                                      <LinkIcon className="w-3 h-3" />
                                      <span className="select-all truncate max-w-md">{gatewayLink}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center space-x-2 shrink-0">
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(gatewayLink);
                                        alert('Gateway link copied to clipboard!');
                                      }}
                                      className="px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 rounded-lg text-xs font-medium flex items-center space-x-1 transition-all"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                      <span>Copy Link</span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        setEditingProductId(p.id);
                                        setEditProductForm(p);
                                      }}
                                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all"
                                    >
                                      <Edit className="w-4 h-4" />
                                    </button>
                                    {products.length > 1 && (
                                      <button
                                        onClick={() => handleDeleteProduct(p.id)}
                                        className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-all"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <form onSubmit={handleUpdateProduct} className="space-y-3">
                                  <div className="flex justify-between items-center">
                                    <h5 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Edit Product</h5>
                                    <button type="button" onClick={() => setEditingProductId(null)} className="text-xs text-slate-400 hover:text-white">Cancel</button>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <input
                                      type="text"
                                      value={editProductForm.name}
                                      onChange={(e) => setEditProductForm({ ...editProductForm, name: e.target.value })}
                                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs"
                                    />
                                    <input
                                      type="number"
                                      value={editProductForm.price}
                                      onChange={(e) => setEditProductForm({ ...editProductForm, price: Number(e.target.value) })}
                                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs"
                                    />
                                  </div>
                                  <textarea
                                    rows={2}
                                    value={editProductForm.description}
                                    onChange={(e) => setEditProductForm({ ...editProductForm, description: e.target.value })}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs"
                                  />
                                  <input
                                    type="text"
                                    value={editProductForm.downloadLink}
                                    onChange={(e) => setEditProductForm({ ...editProductForm, downloadLink: e.target.value })}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-mono"
                                  />
                                  <button
                                    type="submit"
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs"
                                  >
                                    Update Product
                                  </button>
                                </form>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 4: UPI Payment Settings */}
                {adminSubTab === 'upi' && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl max-w-2xl mx-auto space-y-6">
                    <h3 className="text-lg font-bold text-white">UPI Gateway & Receiver Settings</h3>
                    <form onSubmit={handleSaveUpiSettings} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Merchant UPI ID</label>
                        <input
                          type="text"
                          value={editUpiSettings.upiId}
                          onChange={(e) => setEditUpiSettings({ ...editUpiSettings, upiId: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Receiver Name (Displayed on UPI scan & AI check)</label>
                        <input
                          type="text"
                          value={editUpiSettings.receiverName}
                          onChange={(e) => setEditUpiSettings({ ...editUpiSettings, receiverName: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 font-semibold"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Admin Password Change (Optional)</label>
                        <input
                          type="password"
                          placeholder="Leave blank to keep current password"
                          onChange={(e) => setEditUpiSettings({ ...editUpiSettings, adminPassword: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      {settingsMessage && (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl text-xs">
                          {settingsMessage}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={savingSettings}
                        className="py-3 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30"
                      >
                        {savingSettings ? 'Saving...' : 'Save UPI Settings'}
                      </button>
                    </form>
                  </div>
                )}

                {/* Tab 5: Email & SMTP Settings */}
                {adminSubTab === 'smtp' && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl max-w-2xl mx-auto space-y-6">
                    <div className="space-y-1">
                      <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                        <Mail className="w-5 h-5 text-indigo-400" />
                        <span>SMTP Email Server Configuration</span>
                      </h3>
                      <p className="text-xs text-slate-400">Configure your personal or business SMTP mail server (e.g. Gmail App Password, SendGrid, Brevo) to send genuine 6-digit OTP verification emails to customers.</p>
                    </div>

                    <form onSubmit={handleSaveUpiSettings} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">SMTP Host</label>
                          <input
                            type="text"
                            placeholder="smtp.gmail.com"
                            value={editUpiSettings.smtpHost || ''}
                            onChange={(e) => setEditUpiSettings({ ...editUpiSettings, smtpHost: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">SMTP Port</label>
                          <input
                            type="number"
                            placeholder="587"
                            value={editUpiSettings.smtpPort || 587}
                            onChange={(e) => setEditUpiSettings({ ...editUpiSettings, smtpPort: Number(e.target.value) })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">SMTP Username / Email</label>
                          <input
                            type="text"
                            placeholder="your-email@gmail.com"
                            value={editUpiSettings.smtpUser || ''}
                            onChange={(e) => setEditUpiSettings({ ...editUpiSettings, smtpUser: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">SMTP Password / App Password</label>
                          <input
                            type="password"
                            placeholder="16-digit app password"
                            value={editUpiSettings.smtpPass || ''}
                            onChange={(e) => setEditUpiSettings({ ...editUpiSettings, smtpPass: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">Sender From Email</label>
                        <input
                          type="text"
                          placeholder="noreply@upipayverify.com"
                          value={editUpiSettings.smtpFrom || ''}
                          onChange={(e) => setEditUpiSettings({ ...editUpiSettings, smtpFrom: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono"
                        />
                      </div>

                      {settingsMessage && (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-3 rounded-xl text-xs">
                          {settingsMessage}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={savingSettings}
                        className="py-3 px-6 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-indigo-600/30"
                      >
                        {savingSettings ? 'Saving...' : 'Save SMTP Settings'}
                      </button>
                    </form>
                  </div>
                )}

                {/* Tab 6: AI Verification Logs */}
                {adminSubTab === 'verifications' && (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                    <h3 className="text-lg font-bold text-white">AI Screenshot Verification Analysis Logs</h3>
                    <div className="space-y-4">
                      {adminOrders.map((o) => (
                        <div key={o.orderId} className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                            <div>
                              <span className="font-mono text-indigo-300 font-bold text-sm">{o.orderId}</span>
                              <span className="text-xs text-slate-400 ml-2">({new Date(o.orderDate).toLocaleString()})</span>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded text-xs font-semibold ${
                              o.verificationStatus === 'verified' ? 'bg-emerald-500/20 text-emerald-400' :
                              o.verificationStatus === 'failed' ? 'bg-red-500/20 text-red-400' :
                              'bg-amber-500/20 text-amber-400'
                            }`}>
                              AI Status: {o.verificationStatus.toUpperCase()}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                            <div className="space-y-2 text-xs">
                              <p className="font-semibold text-slate-300">Extracted Transaction Details:</p>
                              {o.verificationDetails ? (
                                <div className="bg-slate-900 p-3 rounded-lg space-y-1 font-mono text-slate-300">
                                  <div>UTR / Txn ID: {o.verificationDetails.transactionId || 'N/A'}</div>
                                  <div>Extracted Amount: ₹{o.verificationDetails.extractedAmount ?? 'N/A'}</div>
                                  <div>Receiver: {o.verificationDetails.extractedReceiver || 'N/A'}</div>
                                  <div>Amount Match: {o.verificationDetails.amountMatch ? '✅ Yes' : '❌ No'}</div>
                                  <div>Receiver Match: {o.verificationDetails.receiverMatch ? '✅ Yes' : '❌ No'}</div>
                                  <div>Authentic Check: {o.verificationDetails.isAuthentic ? '✅ Genuine' : '❌ Forged/AI'}</div>
                                  <div className="text-slate-400 pt-1">Reason: {o.verificationDetails.reason}</div>
                                </div>
                              ) : (
                                <p className="text-slate-500 italic">No AI verification performed yet.</p>
                              )}
                            </div>

                            <div className="flex flex-col items-center justify-center">
                              {o.screenshotUrl ? (
                                <a href={o.screenshotUrl} target="_blank" rel="noopener noreferrer" className="group relative">
                                  <img src={o.screenshotUrl} alt="Receipt" className="w-32 h-32 object-cover rounded-xl border border-slate-700 group-hover:opacity-90" />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center text-xs font-semibold text-white">
                                    View Full
                                  </div>
                                </a>
                              ) : (
                                <div className="w-32 h-32 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center text-xs text-slate-500">
                                  No Screenshot
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {adminOrders.length === 0 && (
                        <p className="text-center text-slate-500 py-8">No verification logs available.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
