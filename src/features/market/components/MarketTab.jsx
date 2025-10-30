import React, { useState, useEffect, useMemo } from 'react';
import { getPointsBreakdown } from '../../../shared/utils/pointsManagement';
import { getAvailableProducts, calculateCartTotal, purchaseVouchers, getUserVouchers, getUserVoucherStats, getAllRedeemedVouchers } from '../../../shared/utils/voucherManagement';
import { addVoucherProduct, updateVoucherProduct, deleteVoucherProduct, getAllVoucherProducts } from '../../../shared/utils/voucherProducts';
import { ROLES } from '../../../shared/constants';
import Section from '../../../shared/components/Section';
import { logPwaEvent } from '../../../shared/utils/pwaAnalytics';

const MarketTab = ({ currentUser, t }) => {
  const [cart, setCart] = useState([]);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState('shop'); // shop, my_vouchers, management
  const [userVouchers, setUserVouchers] = useState([]);
  const [voucherStats, setVoucherStats] = useState(null);
  const [availableProducts, setAvailableProducts] = useState([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [showAddVoucherModal, setShowAddVoucherModal] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState(null);
  const [redemptionHistory, setRedemptionHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Calculate usable points
  const pointsBreakdown = useMemo(() => {
    if (!currentUser) return { usable: 0, expired: 0, total: 0, expiringSoon: [] };
    return getPointsBreakdown(currentUser);
  }, [currentUser]);

  const cartTotal = useMemo(() => {
    return calculateCartTotal(cart, availableProducts);
  }, [cart, availableProducts]);

  const isManagement = currentUser?.role === ROLES.MANAGEMENT || currentUser?.role === ROLES.ADMIN;

  // Load products on mount and when tab changes
  useEffect(() => {
    loadProducts();
    // Log market tab visit
    if (currentUser?.id) {
      logPwaEvent('market_tab_click', {
        userId: currentUser.id,
        userName: currentUser.name,
        timestamp: Date.now()
      });
    }
  }, [currentUser]);

  // Reload products when switching tabs to show correct items
  useEffect(() => {
    if (activeTab === 'shop') {
      loadProducts(); // Reload only active products for shop
    }
  }, [activeTab]);

  useEffect(() => {
    if (currentUser && activeTab === 'my_vouchers') {
      loadUserVouchers();
    }
    if (isManagement && activeTab === 'management') {
      loadAllProducts();
      loadRedemptionHistory();
    }
    if (activeTab === 'shop') {
      // Log shop view
      if (currentUser?.id) {
        logPwaEvent('shop_view', {
          userId: currentUser.id,
          userName: currentUser.name,
          timestamp: Date.now()
        });
      }
    }
  }, [currentUser, activeTab, isManagement]);

  const loadProducts = async () => {
    setIsLoadingProducts(true);
    try {
      const products = await getAvailableProducts();
      // getAvailableProducts already returns only active products
      setAvailableProducts(products);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setIsLoadingProducts(false);
    }
  };

  const loadAllProducts = async () => {
    try {
      const allProducts = await getAllVoucherProducts();
      setAvailableProducts(allProducts); // Show all products in management tab
    } catch (error) {
      console.error('Error loading all products:', error);
    }
  };

  const loadRedemptionHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const history = await getAllRedeemedVouchers();
      setRedemptionHistory(history);
    } catch (error) {
      console.error('Error loading redemption history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    // Clear messages after 5 seconds
    if (successMessage || errorMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage('');
        setErrorMessage('');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, errorMessage]);

  const loadUserVouchers = async () => {
    if (!currentUser?.id) return;
    
    try {
      const vouchers = await getUserVouchers(currentUser.id);
      setUserVouchers(vouchers);
      
      const stats = await getUserVoucherStats(currentUser.id);
      setVoucherStats(stats);
    } catch (error) {
      console.error('Error loading vouchers:', error);
    }
  };

  const addToCart = (productId, quantity = 1) => {
    const existingItem = cart.find(item => item.productId === productId);
    
    if (existingItem) {
      setCart(cart.map(item => 
        item.productId === productId 
          ? { ...item, quantity: item.quantity + quantity }
          : item
      ));
    } else {
      setCart([...cart, { productId, quantity }]);
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const updateCartQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      setCart(cart.map(item =>
        item.productId === productId ? { ...item, quantity } : item
      ));
    }
  };

  const handlePurchase = async () => {
    if (cart.length === 0) {
      setErrorMessage('Your cart is empty');
      return;
    }

    if (cartTotal > pointsBreakdown.usable) {
      setErrorMessage(`Insufficient points. You need ${cartTotal} but have ${pointsBreakdown.usable} usable points`);
      return;
    }

    if (!window.confirm(`Purchase vouchers for ${cartTotal} points?`)) {
      return;
    }

    setIsPurchasing(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const result = await purchaseVouchers(currentUser.id, currentUser.name, cart);
      
      if (result.success) {
        setSuccessMessage(`Successfully purchased ${result.vouchersCreated} voucher(s)!`);
        setCart([]);
        // Log voucher purchase
        logPwaEvent('voucher_purchased', {
          userId: currentUser.id,
          userName: currentUser.name,
          vouchersCount: result.vouchersCreated,
          totalPoints: cartTotal,
          timestamp: Date.now()
        });
        // Reload vouchers if on my_vouchers tab
        if (activeTab === 'my_vouchers') {
          await loadUserVouchers();
        }
      } else {
        setErrorMessage(result.error || 'Failed to purchase vouchers');
      }
    } catch (error) {
      console.error('Purchase error:', error);
      setErrorMessage('An error occurred while purchasing vouchers');
    } finally {
      setIsPurchasing(false);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      <Section title={t('market') || 'Marketplace'}>
        {/* Current Usable Points Display */}
        <div className="bg-gradient-to-r from-brand-50 to-brand-100 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center mb-2">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              className="text-brand-600 mr-2"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <span className="text-sm font-medium text-brand-700">
                  {t('usablePoints') || 'Usable Points'}
            </span>
          </div>
              <div className="text-3xl font-bold text-brand-800">
                {pointsBreakdown.usable}
              </div>
              <div className="text-xs text-brand-600 mt-1">
                Expired: {pointsBreakdown.expired} • Total: {pointsBreakdown.total}
              </div>
            </div>
            {cart.length > 0 && (
              <div className="bg-white rounded-lg px-4 py-3 border-2 border-brand-500">
                <div className="text-sm text-slate-600">Cart Total</div>
                <div className="text-2xl font-bold text-brand-600">{cartTotal}</div>
              </div>
            )}
          </div>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('shop')}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              activeTab === 'shop'
                ? 'bg-brand-600 text-white'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            🛒 Shop
          </button>
          <button
            onClick={() => setActiveTab('my_vouchers')}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              activeTab === 'my_vouchers'
                ? 'bg-brand-600 text-white'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            🎫 My Vouchers
          </button>
          {isManagement && (
            <button
              onClick={() => setActiveTab('management')}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                activeTab === 'management'
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              ⚙️ Manage
            </button>
          )}
        </div>

        {/* Points Expiring Soon Warning */}
        {pointsBreakdown.expiringSoon.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <div className="flex items-start">
              <svg className="w-5 h-5 text-amber-600 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-900">Points expiring soon!</p>
                <p className="text-xs text-amber-700 mt-1">
                  You have {pointsBreakdown.expiringSoon.reduce((sum, e) => sum + e.points, 0)} points expiring within 7 days. Use them before they expire!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-green-800">{successMessage}</p>
          </div>
        )}
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-sm text-red-800">{errorMessage}</p>
          </div>
        )}

        {/* Shop Tab */}
        {activeTab === 'shop' && (
          <div>
            {/* Product List - Single column on all screens */}
            <div className="grid grid-cols-1 gap-4 mb-4">
              {availableProducts.map((product) => {
                const cartItem = cart.find(item => item.productId === product.id);
                const inCart = !!cartItem;
                const quantity = cartItem?.quantity || 0;
                const isFullyRedeemed = (product.redeemedQuantity || 0) >= (product.totalQuantity || 0);

                return (
                  <div key={product.id} className={`bg-white rounded-lg border p-4 flex flex-col ${
                    isFullyRedeemed ? 'border-amber-300 bg-amber-50' : 'border-slate-200'
                  }`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900">{product.name}</h3>
                        <p className="text-xs text-slate-500">{product.category}</p>
                      </div>
                      <div className="text-right ml-2">
                        <div className="text-2xl font-bold text-brand-600">{product.points}</div>
                        <div className="text-xs text-slate-500">points</div>
                      </div>
              </div>
                    
                    <p className="text-sm text-slate-600 mb-3 flex-grow">{product.description}</p>

                    {product.termsAndConditions && (
                        <button 
                            onClick={() => alert(product.termsAndConditions)} 
                            className="text-xs text-slate-500 hover:text-brand-600 mb-2 self-start"
                        >
                            <span className="inline-flex items-center gap-1">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Terms & Conditions
              </span>
                        </button>
                    )}

                    <div className="mt-auto">
                    {!inCart ? (
                      <button
                        onClick={() => addToCart(product.id)}
                        disabled={isFullyRedeemed}
                        className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
                          isFullyRedeemed
                            ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                            : 'bg-brand-600 text-white hover:bg-brand-700'
                        }`}
                      >
                        {isFullyRedeemed ? 'Fully Redeemed' : 'Add to Cart'}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateCartQuantity(product.id, quantity - 1)}
                          className="flex-1 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
                        >
                          −
                        </button>
                        <div className="px-4 py-2 font-semibold">{quantity}</div>
                        <button
                          onClick={() => updateCartQuantity(product.id, quantity + 1)}
                          className="flex-1 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors"
                        >
                          +
                        </button>
                        <button
                          onClick={() => removeFromCart(product.id)}
                          className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Cart Summary & Checkout */}
            {cart.length > 0 && (
              <div className="bg-white rounded-lg border-2 border-brand-500 p-4 sticky bottom-0">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-sm text-slate-600">Cart Total</div>
                    <div className="text-2xl font-bold text-brand-600">{cartTotal} points</div>
                  </div>
                  <button
                    onClick={() => setCart([])}
                    className="text-sm text-slate-500 hover:text-slate-700"
                  >
                    Clear Cart
                  </button>
                </div>
                <button
                  onClick={handlePurchase}
                  disabled={isPurchasing}
                  className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                    isPurchasing
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-brand-600 text-white hover:bg-brand-700'
                  }`}
                >
                  {isPurchasing ? 'Processing...' : 'Purchase Vouchers'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* My Vouchers Tab */}
        {activeTab === 'my_vouchers' && (
          <div>
            {/* Voucher Statistics */}
            {voucherStats && (
              <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-4 mb-4">
                <h3 className="font-semibold text-purple-900 mb-3">Your Voucher Stats</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-2xl font-bold text-purple-600">{voucherStats.total}</div>
                    <div className="text-xs text-purple-700">Total Vouchers</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-2xl font-bold text-green-600">{voucherStats.pending + voucherStats.confirmed}</div>
                    <div className="text-xs text-green-700">Available</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-2xl font-bold text-blue-600">{voucherStats.used}</div>
                    <div className="text-xs text-blue-700">Used</div>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <div className="text-2xl font-bold text-orange-600">{voucherStats.totalPointsSpent}</div>
                    <div className="text-xs text-orange-700">Points Spent</div>
            </div>
              </div>
            </div>
            )}

            {/* Voucher List */}
            {userVouchers.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-lg">
                <div className="text-4xl mb-3">🎫</div>
                <p className="text-slate-600">No vouchers yet</p>
                <p className="text-sm text-slate-500 mt-1">Purchase vouchers from the shop!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {userVouchers.map((voucher) => (
                  <div
                    key={voucher.id}
                    className={`bg-white rounded-lg border-2 p-4 ${
                      voucher.status === 'used'
                        ? 'border-slate-200 bg-slate-50'
                        : voucher.status === 'pending'
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-green-200 bg-green-50'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-4xl">{voucher.productIcon}</div>
                        <div>
                          <h3 className="font-semibold text-slate-900">{voucher.productName}</h3>
                          <p className="text-xs text-slate-500">Code: {voucher.code}</p>
                          {voucher.purchasedAt && (
                            <p className="text-xs text-slate-500">
                              Purchased: {voucher.purchasedAt.toDate?.().toLocaleDateString() || new Date(voucher.purchasedAt.seconds * 1000).toLocaleDateString()}
                            </p>
                          )}
            </div>
              </div>
                      <div className="text-right">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          voucher.status === 'used'
                            ? 'bg-slate-200 text-slate-600'
                            : voucher.status === 'pending'
                            ? 'bg-amber-200 text-amber-600'
                            : 'bg-green-200 text-green-600'
                        }`}>
                          {voucher.status}
              </span>
            </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Management Tab */}
        {activeTab === 'management' && isManagement && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Voucher Management</h3>
              <button
                onClick={() => { setEditingVoucher(null); setShowAddVoucherModal(true); }}
                className="btn btn-primary"
              >
                + Add Voucher
              </button>
            </div>
            
            <div className="bg-white rounded-lg border p-4">
              <h4 className="font-semibold mb-2">All Vouchers</h4>
              <div className="space-y-2">
                {availableProducts.map(product => (
                  <div key={product.id} className={`p-2 border-b flex justify-between items-center ${!product.isActive ? 'bg-gray-50' : ''}`}>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{product.name}</p>
                        {product.isActive ? (
                          <span className="px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full">Live</span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">Draft</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">{product.points} points • {product.totalQuantity || 0} total</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{product.redeemedQuantity || 0} / {product.totalQuantity || '∞'}</p>
                      <p className="text-sm text-slate-500">Redeemed</p>
                    </div>
                     <div className="flex gap-2">
                        <button 
                            onClick={() => { setEditingVoucher(product); setShowAddVoucherModal(true); }}
                            className="btn btn-sm btn-secondary"
                        >
                            Edit
                        </button>
                        <button 
                            onClick={async () => {
                                if (window.confirm(`Are you sure you want to delete "${product.name}"?`)) {
                                    await deleteVoucherProduct(product.id);
                                    loadAllProducts();
                                }
                            }}
                            className="btn btn-sm btn-danger"
                        >
                            Delete
                        </button>
                     </div>
                  </div>
                ))}
          </div>
        </div>
        
            <div className="mt-6 bg-white rounded-lg border p-4">
              <h4 className="font-semibold mb-2">Voucher Redemption History</h4>
              {isLoadingHistory ? (
                <p>Loading history...</p>
              ) : redemptionHistory.length === 0 ? (
                <p className="text-slate-500">No vouchers have been redeemed yet.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {redemptionHistory.map(voucher => (
                    <div key={voucher.id} className="p-2 border-b">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{voucher.productName}</p>
                          <p className="text-sm text-slate-500">by {voucher.userName}</p>
                        </div>
                        <div className="text-right">
                           <p className="font-medium">{voucher.pointsSpent} points</p>
                           <p className="text-xs text-slate-500">
                             {voucher.purchasedAt?.toDate().toLocaleString() || 'N/A'}
                           </p>
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Code: {voucher.code} | Status: {voucher.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </Section>

      {showAddVoucherModal && isManagement && (
        <VoucherFormModal
          voucher={editingVoucher}
          onClose={() => { setShowAddVoucherModal(false); setEditingVoucher(null); }}
          onSave={async (voucherData) => {
            if (editingVoucher) {
              await updateVoucherProduct(editingVoucher.id, voucherData);
            } else {
              await addVoucherProduct(voucherData);
            }
            setShowAddVoucherModal(false);
            setEditingVoucher(null);
            await loadProducts();
            await loadAllProducts();
          }}
          t={t}
        />
      )}
    </div>
  );
};

const VoucherFormModal = ({ voucher, onClose, onSave, t }) => {
    const [formData, setFormData] = useState({
        name: '',
        points: '',
        totalQuantity: '',
        description: '',
        termsAndConditions: '',
        category: 'General',
        isActive: false, // Draft by default
    });

    useEffect(() => {
        if (voucher) {
            setFormData({
                name: voucher.name || '',
                points: voucher.points || '',
                totalQuantity: voucher.totalQuantity || '',
                description: voucher.description || '',
                termsAndConditions: voucher.termsAndConditions || '',
                category: voucher.category || 'General',
                isActive: !!voucher.isActive,
            });
        }
    }, [voucher]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const dataToSave = {
            ...formData,
            points: parseInt(formData.points, 10),
            totalQuantity: parseInt(formData.totalQuantity, 10),
        };
        onSave(dataToSave);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleSubmit}>
                    <div className="flex justify-between items-center p-4 border-b">
                        <h3 className="text-lg font-semibold">{voucher ? 'Edit Voucher' : 'Add New Voucher'}</h3>
                        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                    </div>
                    <div className="p-4 space-y-4">
                        <div className="flex items-center justify-between p-3 rounded border bg-slate-50">
                          <div>
                            <div className="text-sm font-medium">Status</div>
                            <div className="text-xs text-slate-500">Only Live vouchers appear in Shop</div>
                          </div>
                          <label className="inline-flex items-center cursor-pointer">
                            <span className="text-xs mr-2">Draft</span>
                            <input type="checkbox" name="isActive" checked={!!formData.isActive} onChange={handleChange} className="sr-only peer" />
                            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-brand-600 relative transition-colors">
                              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${formData.isActive ? 'translate-x-5' : ''}`}></div>
                            </div>
                            <span className="text-xs ml-2">Live</span>
                          </label>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Voucher Name</label>
                            <input type="text" name="name" value={formData.name} onChange={handleChange} className="input" required />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Points</label>
                                <input type="number" name="points" value={formData.points} onChange={handleChange} className="input" required min="0" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">Total Quantity</label>
                                <input type="number" name="totalQuantity" value={formData.totalQuantity} onChange={handleChange} className="input" required min="0" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Category</label>
                            <input type="text" name="category" value={formData.category} onChange={handleChange} className="input" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Description</label>
                            <textarea name="description" value={formData.description} onChange={handleChange} className="input" rows="2"></textarea>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Terms & Conditions</label>
                            <textarea name="termsAndConditions" value={formData.termsAndConditions} onChange={handleChange} className="input" rows="3"></textarea>
          </div>
        </div>
                    <div className="p-4 border-t flex justify-end gap-2">
                        <button type="button" onClick={onClose} className="btn btn-secondary">Cancel</button>
                        <button type="submit" className="btn btn-primary">Save Voucher</button>
                    </div>
                </form>
      </div>
    </div>
  );
};

export default MarketTab;


























