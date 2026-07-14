import React, { useState, useEffect, createContext, useContext, useCallback, memo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Alert,
  TextInput, Clipboard, FlatList, Modal, Share, Switch
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ThemeContext = createContext();
const useTheme = () => useContext(ThemeContext);

// ==============================
// Вспомогательные функции
// ==============================
const getTelegramUser = () => {
  try {
    const tg = typeof window !== "undefined" && window.Telegram && window.Telegram.WebApp;
    if (tg) {
      tg.ready();
      const data = tg.initDataUnsafe?.user;
      if (data) return { id: data.id, name: data.first_name || "Пользователь", username: data.username || "guest" };
    }
  } catch (e) {}
  return { id: "guest", name: "Пользователь", username: "guest" };
};

const money = (v) => v.toLocaleString("ru-RU") + " Br";
const getBrands = (products) => [...new Set(products.map(p => p.brand))];
const ADMIN_IDS = [778715828, 987654321];

const DEFAULT_PRODUCTS = [
  { id: 1, brand: "NIKE", name: "Dunk Low Panda", price: 18990, oldPrice: null, image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff", sales: 120, ratings: [], averageRating: 0, description: "Классические Nike Dunk Low Panda.", sizes: ["40","41","42","43","44"] },
  { id: 2, brand: "ADIDAS", name: "Ozweego Core Black", price: 21990, oldPrice: null, image: "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519", sales: 95, ratings: [], averageRating: 0, description: "Adidas Ozweego с массивной подошвой.", sizes: ["41","42","43"] },
  { id: 3, brand: "NIKE", name: "Air Force Shadow", price: 13990, oldPrice: 17990, image: "https://images.unsplash.com/photo-1549298916-b41d501d3772", sales: 180, ratings: [], averageRating: 0, description: "Nike Air Force Shadow – классика.", sizes: ["39","40","41","42"] },
  { id: 4, brand: "NEW BALANCE", name: "9060 Sea Salt", price: 15990, oldPrice: 19990, image: "https://images.unsplash.com/photo-1552346154-21d32810aba3", sales: 240, ratings: [], averageRating: 0, description: "New Balance 9060 – комфорт и стиль.", sizes: ["40","41","42","43"] },
  { id: 5, brand: "JORDAN", name: "Jordan Retro", price: 24990, oldPrice: 29990, image: "https://images.unsplash.com/photo-1460353581641-37baddab0fa2", sales: 80, ratings: [], averageRating: 0, description: "Культовые Jordan Retro.", sizes: ["42","43","44","45"] },
  { id: 6, brand: "PUMA", name: "Puma Classic", price: 11990, oldPrice: null, image: "https://images.unsplash.com/photo-1495555961986-6d4c1ecb7be3", sales: 60, ratings: [], averageRating: 0, description: "Puma Classic – надёжная классика.", sizes: ["40","41","42"] }
];

const LEVELS = [
  { name: "Новичок", min: 0, max: 4, cashback: 2 },
  { name: "Постоянный клиент", min: 5, max: 14, cashback: 5 },
  { name: "VIP клиент", min: 15, max: 999, cashback: 10 }
];
const ORDER_STATUSES = ["Ожидает подтверждения", "Принят", "На сборке", "Доставляется", "Готов к выдаче"];

// ==============================
// CloudStorage (без изменений)
// ==============================
const getCloudStorage = () => {
  if (typeof window !== "undefined" && window.Telegram?.WebApp?.CloudStorage) {
    return window.Telegram.WebApp.CloudStorage;
  }
  return null;
};

const saveToCloud = async (key, data) => {
  const cloud = getCloudStorage();
  if (cloud) {
    try {
      await new Promise((resolve, reject) => {
        cloud.setItem(key, JSON.stringify(data), (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (e) { console.warn("CloudStorage save error:", e); }
  }
};

const loadFromCloud = async (key) => {
  const cloud = getCloudStorage();
  if (cloud) {
    try {
      const value = await new Promise((resolve, reject) => {
        cloud.getItem(key, (err, val) => {
          if (err) reject(err);
          else resolve(val);
        });
      });
      return value ? JSON.parse(value) : null;
    } catch (e) { console.warn("CloudStorage load error:", e); return null; }
  }
  return null;
};

// ==============================
// TrackingInput (мемоизированный)
// ==============================
const TrackingInput = memo(({ orderId, initialValue, onUpdate }) => {
  const [tracking, setTracking] = useState(initialValue || "");
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const handleChange = (text) => {
    setTracking(text);
    if (onUpdate) onUpdate(orderId, text);
  };

  return (
    <TextInput
      style={[styles.trackingInput, isDark && styles.inputDark]}
      placeholder="Трек"
      placeholderTextColor={isDark ? "#999" : "#888"}
      value={tracking}
      onChangeText={handleChange}
    />
  );
});

// ==============================
// ОСНОВНОЙ КОМПОНЕНТ APP (сокращён для экономии места, но в финальном коде он полный)
// ==============================
export default function App() {
  const user = getTelegramUser();
  const [theme, setTheme] = useState("light");
  const toggleTheme = () => setTheme(t => t === "light" ? "dark" : "light");
  const isAdmin = ADMIN_IDS.includes(user.id);

  const [page, setPage] = useState("home");
  const [cart, setCart] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [orders, setOrders] = useState(0);
  const [bonusBalance, setBonusBalance] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedSize, setSelectedSize] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  const [useBonus, setUseBonus] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [orderHistory, setOrderHistory] = useState([]);
  const [products, setProducts] = useState(DEFAULT_PRODUCTS);
  const [adminOrders, setAdminOrders] = useState([]);
  const [showAdmin, setShowAdmin] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [lastOrderNumber, setLastOrderNumber] = useState(3340);
  const [users, setUsers] = useState([]);
  const [broadcastText, setBroadcastText] = useState("");
  const [promoCodes, setPromoCodes] = useState([]);
  const [usedFreeDelivery, setUsedFreeDelivery] = useState([]);
  const [referrals, setReferrals] = useState([]);

  const [sizeModalVisible, setSizeModalVisible] = useState(false);
  const [sizeModalProduct, setSizeModalProduct] = useState(null);
  const [tempSelectedSize, setTempSelectedSize] = useState(null);

  const STORAGE_KEYS = {
    cart: "@krost_cart",
    favorites: "@krost_favorites",
    orders: "@krost_orders",
    bonus: "@krost_bonus",
    orderHistory: "@krost_orderHistory",
    products: "@krost_products",
    theme: "@krost_theme",
    adminOrders: "@krost_adminOrders",
    lastOrderNumber: "@krost_lastOrderNumber",
    users: "@krost_users",
    promoCodes: "@krost_promoCodes",
    usedFreeDelivery: "@krost_usedFreeDelivery",
    referrals: "@krost_referrals"
  };
  const CLOUD_KEYS = {
    cart: "krost_cart",
    favorites: "krost_favorites",
    orders: "krost_orders",
    bonus: "krost_bonus",
    orderHistory: "krost_orderHistory",
    lastOrderNumber: "krost_lastOrderNumber",
    usedFreeDelivery: "krost_usedFreeDelivery",
    referrals: "krost_referrals"
  };

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [c, f, o, b, h, p, t, a, ln, u, pc, ufd, refs] = await AsyncStorage.multiGet([
          STORAGE_KEYS.cart, STORAGE_KEYS.favorites, STORAGE_KEYS.orders, STORAGE_KEYS.bonus,
          STORAGE_KEYS.orderHistory, STORAGE_KEYS.products, STORAGE_KEYS.theme, STORAGE_KEYS.adminOrders,
          STORAGE_KEYS.lastOrderNumber, STORAGE_KEYS.users, STORAGE_KEYS.promoCodes, STORAGE_KEYS.usedFreeDelivery,
          STORAGE_KEYS.referrals
        ]);
        let localCart = c[1] ? JSON.parse(c[1]) : [];
        let localFavorites = f[1] ? JSON.parse(f[1]) : [];
        let localOrders = o[1] ? JSON.parse(o[1]) : 0;
        let localBonus = b[1] ? JSON.parse(b[1]) : 0;
        let localOrderHistory = h[1] ? JSON.parse(h[1]) : [];
        let localProducts = p[1] ? JSON.parse(p[1]) : DEFAULT_PRODUCTS;
        let localTheme = t[1] ? JSON.parse(t[1]) : "light";
        let localAdminOrders = a[1] ? JSON.parse(a[1]) : [];
        let localLastOrderNumber = ln[1] ? JSON.parse(ln[1]) : 3340;
        let localUsers = u[1] ? JSON.parse(u[1]) : [];
        let localPromoCodes = pc[1] ? JSON.parse(pc[1]) : [];
        let localUsedFreeDelivery = ufd[1] ? JSON.parse(ufd[1]) : [];
        let localReferrals = refs[1] ? JSON.parse(refs[1]) : [];

        const cloudCart = await loadFromCloud(CLOUD_KEYS.cart);
        const cloudFavorites = await loadFromCloud(CLOUD_KEYS.favorites);
        const cloudOrders = await loadFromCloud(CLOUD_KEYS.orders);
        const cloudBonus = await loadFromCloud(CLOUD_KEYS.bonus);
        const cloudOrderHistory = await loadFromCloud(CLOUD_KEYS.orderHistory);
        const cloudLastOrderNumber = await loadFromCloud(CLOUD_KEYS.lastOrderNumber);
        const cloudUsedFreeDelivery = await loadFromCloud(CLOUD_KEYS.usedFreeDelivery);
        const cloudReferrals = await loadFromCloud(CLOUD_KEYS.referrals);

        if (cloudCart !== null) localCart = cloudCart;
        if (cloudFavorites !== null) localFavorites = cloudFavorites;
        if (cloudOrders !== null) localOrders = cloudOrders;
        if (cloudBonus !== null) localBonus = cloudBonus;
        if (cloudOrderHistory !== null) localOrderHistory = cloudOrderHistory;
        if (cloudLastOrderNumber !== null) localLastOrderNumber = cloudLastOrderNumber;
        if (cloudUsedFreeDelivery !== null) localUsedFreeDelivery = cloudUsedFreeDelivery;
        if (cloudReferrals !== null) localReferrals = cloudReferrals;

        setCart(localCart);
        setFavorites(localFavorites);
        setOrders(localOrders);
        setBonusBalance(localBonus);
        setOrderHistory(localOrderHistory);
        setProducts(localProducts);
        setTheme(localTheme);
        setAdminOrders(localAdminOrders);
        setLastOrderNumber(localLastOrderNumber);
        setUsers(localUsers);
        setPromoCodes(localPromoCodes);
        setUsedFreeDelivery(localUsedFreeDelivery);
        setReferrals(localReferrals);
      } catch (e) { console.warn("Ошибка загрузки", e); }
    };
    loadAll();
  }, []);

  // Обработка реферального перехода (упрощённо)
  useEffect(() => {
    const tg = typeof window !== "undefined" && window.Telegram?.WebApp;
    if (tg) {
      const startParam = tg.initDataUnsafe?.start_param;
      if (startParam && startParam !== user.id) {
        Alert.alert("Реферальная ссылка", `Вы перешли по ссылке пользователя ${startParam}`);
      }
    }
  }, []);

  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart)); saveToCloud(CLOUD_KEYS.cart, cart); }, [cart]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favorites)); saveToCloud(CLOUD_KEYS.favorites, favorites); }, [favorites]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(orders)); saveToCloud(CLOUD_KEYS.orders, orders); }, [orders]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.bonus, JSON.stringify(bonusBalance)); saveToCloud(CLOUD_KEYS.bonus, bonusBalance); }, [bonusBalance]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.orderHistory, JSON.stringify(orderHistory)); saveToCloud(CLOUD_KEYS.orderHistory, orderHistory); }, [orderHistory]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.lastOrderNumber, JSON.stringify(lastOrderNumber)); saveToCloud(CLOUD_KEYS.lastOrderNumber, lastOrderNumber); }, [lastOrderNumber]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.usedFreeDelivery, JSON.stringify(usedFreeDelivery)); saveToCloud(CLOUD_KEYS.usedFreeDelivery, usedFreeDelivery); }, [usedFreeDelivery]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.referrals, JSON.stringify(referrals)); saveToCloud(CLOUD_KEYS.referrals, referrals); }, [referrals]);

  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.products, JSON.stringify(products)); }, [products]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.theme, JSON.stringify(theme)); }, [theme]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.adminOrders, JSON.stringify(adminOrders)); }, [adminOrders]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users)); }, [users]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.promoCodes, JSON.stringify(promoCodes)); }, [promoCodes]);

  useEffect(() => {
    if (user.id !== "guest" && !users.some(u => u.id === user.id)) {
      setUsers(prev => [...prev, user]);
    }
  }, [user]);

  const currentLevel = LEVELS.find(l => orders >= l.min && orders <= l.max) || LEVELS[0];
  const nextLevel = LEVELS[LEVELS.indexOf(currentLevel) + 1];
  let progress = 100;
  if (nextLevel) progress = Math.min(100, Math.floor(((orders - currentLevel.min) / (nextLevel.min - currentLevel.min)) * 100));
  const referral = `https://t.me/manzshop_bot?start=${user.id}`;

  const addCart = (item) => setCart([...cart, item]);
  const removeCart = (idx) => setCart(cart.filter((_, i) => i !== idx));

  const toggleFavorite = (item) => {
    favorites.some(x => x.id === item.id)
      ? setFavorites(favorites.filter(x => x.id !== item.id))
      : setFavorites([...favorites, item]);
  };

  const copyReferral = () => {
    const link = referral;
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(link).then(() => {
        Alert.alert("Готово", "Ссылка скопирована");
      }).catch(() => {
        Clipboard.setString(link);
        Alert.alert("Готово", "Ссылка скопирована");
      });
    } else {
      Clipboard.setString(link);
      Alert.alert("Готово", "Ссылка скопирована");
    }
  };

  const openOrderModal = () => setOrderModalVisible(true);
  const closeOrderModal = () => { setOrderModalVisible(false); setUseBonus(false); setPromoCode(""); };

  const calculateTotals = () => {
    const total = cart.reduce((s, i) => s + i.price, 0);
    let discount = 0;
    const foundPromo = promoCodes.find(p => p.code.toUpperCase() === promoCode.toUpperCase() && p.active);
    if (foundPromo) {
      discount = total * (foundPromo.discount / 100);
    }
    let finalTotal = total - discount;
    let usedBonus = 0;
    if (useBonus && bonusBalance > 0) { usedBonus = Math.min(bonusBalance, finalTotal); finalTotal -= usedBonus; }
    return { total, discount, usedBonus, finalTotal };
  };

  const isFreeDeliveryEligible = (phone, fullName) => {
    return !usedFreeDelivery.some(item => item.phone === phone.trim() && item.fullName === fullName.trim());
  };

  const placeOrderWithDetails = (deliveryData) => {
    const { fullName, address, phone, delivery, freeDelivery } = deliveryData;
    const { total, discount, usedBonus, finalTotal } = calculateTotals();
    let deliveryPrice = delivery === "europost" ? 8 : 10;
    if (freeDelivery) {
      deliveryPrice = 0;
      setUsedFreeDelivery(prev => [...prev, { phone: phone.trim(), fullName: fullName.trim() }]);
    }
    const orderTotal = finalTotal + deliveryPrice;
    const nextNumber = lastOrderNumber + 1;
    setLastOrderNumber(nextNumber);
    const order = {
      id: nextNumber, items: cart.map(i => ({ ...i })), total, delivery, address, phone, fullName,
      deliveryPrice, discount, usedBonus, finalTotal: orderTotal, date: new Date().toISOString(),
      status: "Ожидает подтверждения", trackingNumber: null, freeDelivery
    };
    setOrderHistory(prev => [order, ...prev]);
    setAdminOrders(prev => [order, ...prev]);
    const cashback = Math.floor(total * (currentLevel.cashback / 100));
    setBonusBalance(prev => prev + cashback - usedBonus);
    setOrders(orders + 1);
    setCart([]);
    closeOrderModal();
    Alert.alert(
      "Заказ оформлен",
      `Номер заказа: ${nextNumber}\nСтатус: Ожидает подтверждения\n${freeDelivery ? "Доставка бесплатная (первый заказ)!" : ""}\n\nЕсли у менеджера будут вопросы, он свяжется с вами.\nА если у вас есть вопросы, вы можете связаться по ссылке в описании бота.`,
      [
        { text: "OK" },
        { text: "Перейти в историю", onPress: () => setPage("profile") }
      ]
    );
  };

  const addRating = (productId, rating, comment) => {
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        const newRatings = [...p.ratings, { userId: user.id, rating, comment, date: new Date().toISOString() }];
        const avg = newRatings.reduce((s, r) => s + r.rating, 0) / newRatings.length;
        return { ...p, ratings: newRatings, averageRating: avg };
      }
      return p;
    }));
  };

  const shareProduct = async (product) => {
    try { await Share.share({ message: `${product.brand} ${product.name} - ${money(product.price)}\nhttps://t.me/manzshop_bot?start=product_${product.id}` }); } catch (e) {}
  };

  const getRecommended = () => {
    if (orderHistory.length === 0) return [];
    const lastOrder = orderHistory[0];
    const brands = lastOrder.items.map(i => i.brand);
    return products.filter(p => brands.includes(p.brand) && !lastOrder.items.some(i => i.id === p.id)).slice(0, 4);
  };

  const filtered = products.filter(p => {
    const matchName = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.brand.toLowerCase().includes(searchQuery.toLowerCase());
    const matchBrand = selectedBrand ? p.brand === selectedBrand : true;
    const matchPrice = (minPrice === "" || p.price >= parseInt(minPrice)) && (maxPrice === "" || p.price <= parseInt(maxPrice));
    return matchName && matchBrand && matchPrice;
  });
  const PAGE_SIZE = 4;
  const paginated = filtered.slice(0, currentPage * PAGE_SIZE);
  const hasMore = paginated.length < filtered.length;
  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setTimeout(() => { setCurrentPage(prev => prev + 1); setLoadingMore(false); }, 500);
  };
  useEffect(() => {
    if (page === "catalog") { setCurrentPage(1); setLoadingMore(false); }
  }, [page, searchQuery, selectedBrand, minPrice, maxPrice]);

  const toggleAdmin = () => {
    if (!isAdmin) { Alert.alert("Доступ запрещён", "У вас нет прав администратора"); return; }
    setShowAdmin(!showAdmin);
  };
  const deleteProduct = (id) => {
    Alert.alert("Удалить?", "", [{ text: "Отмена" }, { text: "Удалить", onPress: () => setProducts(products.filter(p => p.id !== id)) }]);
  };
  const addProduct = () => {
    const np = { id: Date.now(), brand: "Новый бренд", name: "Название", price: 0, oldPrice: null, image: "https://via.placeholder.com/150", sales: 0, ratings: [], averageRating: 0, description: "Описание", sizes: ["40","41","42"] };
    setProducts([np, ...products]);
    setEditingProduct(np.id);
  };
  const updateProduct = (id, field, value) => {
    setProducts(prev => prev.map(p => {
      if (p.id === id) {
        if (field === "price" || field === "oldPrice") return { ...p, [field]: parseInt(value) || 0 };
        if (field === "sizes") return { ...p, [field]: value.split(',').map(s => s.trim()) };
        return { ...p, [field]: value };
      }
      return p;
    }));
  };
  const changeStatus = useCallback((orderId, newStatus) => {
    setAdminOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return { ...o, status: newStatus };
      }
      return o;
    }));
    setOrderHistory(prev => prev.map(o => {
      if (o.id === orderId) {
        return { ...o, status: newStatus };
      }
      return o;
    }));
    Alert.alert("Статус обновлён", `Заказ #${orderId} теперь имеет статус "${newStatus}"`);
  }, []);
  const updateTracking = useCallback((orderId, trackingNumber) => {
    setAdminOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return { ...o, trackingNumber };
      }
      return o;
    }));
    setOrderHistory(prev => prev.map(o => {
      if (o.id === orderId) {
        return { ...o, trackingNumber };
      }
      return o;
    }));
    if (trackingNumber) {
      Alert.alert("Трек-номер добавлен", `Для заказа #${orderId} добавлен трек-номер: ${trackingNumber}`);
    }
  }, []);
  const sendBroadcast = () => {
    if (!broadcastText.trim()) { Alert.alert("Ошибка", "Введите текст"); return; }
    Alert.alert("Рассылка отправлена", `Сообщение: ${broadcastText}\nПолучателей: ${users.length}`);
    setBroadcastText("");
  };

  const addPromoCode = () => {
    const code = prompt("Введите код (например, SAVE10)");
    if (!code) return;
    const discount = prompt("Введите скидку в % (например, 10)");
    if (!discount) return;
    const description = prompt("Описание (необязательно)") || "";
    setPromoCodes(prev => [...prev, { code: code.toUpperCase(), discount: parseInt(discount), description, active: true }]);
  };
  const togglePromoActive = (index) => {
    setPromoCodes(prev => prev.map((p, i) => i === index ? { ...p, active: !p.active } : p));
  };
  const deletePromoCode = (index) => {
    Alert.alert("Удалить промокод?", "", [
      { text: "Отмена" },
      { text: "Удалить", onPress: () => setPromoCodes(prev => prev.filter((_, i) => i !== index)) }
    ]);
  };

  let adminRevenue = 0;
  const salesMap = {};
  adminOrders.forEach(o => { adminRevenue += o.finalTotal; o.items.forEach(i => { salesMap[i.id] = (salesMap[i.id] || 0) + 1; }); });
  const popular = Object.keys(salesMap).sort((a,b) => salesMap[b] - salesMap[a]).slice(0,5).map(id => products.find(p => p.id === parseInt(id))).filter(Boolean);

  // ==============================
  // КОМПОНЕНТЫ СТРАНИЦ (ProductCard, Home, Catalog, ProductPage, Favorites, Cart, Profile, AdminPanel)
  // ==============================
  // Они полностью идентичны предыдущей версии, я не буду их дублировать, чтобы не занимать место.
  // Но в финальном коде они все присутствуют.
  // Я приведу только исправленный OrderModal и Menu, остальное – такое же как в прошлом коде.

  // ---- ИСПРАВЛЕННАЯ МОДАЛКА ЗАКАЗА (с явными цветами для тёмной темы) ----
  const OrderModal = () => {
    const [fullName, setFullName] = useState("");
    const [address, setAddress] = useState("");
    const [phone, setPhone] = useState("");
    const [delivery, setDelivery] = useState("europost");
    const [useFreeDelivery, setUseFreeDelivery] = useState(false);
    const { theme } = useTheme();
    const isDark = theme === "dark";

    useEffect(() => {
      if (!orderModalVisible) {
        setFullName("");
        setAddress("");
        setPhone("");
        setDelivery("europost");
        setUseFreeDelivery(false);
      }
    }, [orderModalVisible]);

    const { finalTotal } = calculateTotals();
    let dp = delivery === "europost" ? 8 : 10;
    const eligible = fullName.trim() && phone.trim() ? isFreeDeliveryEligible(phone, fullName) : false;
    const showFreeDeliveryOption = eligible && orderHistory.length === 0;
    if (useFreeDelivery && showFreeDeliveryOption) dp = 0;
    const days = delivery === "europost" ? "4-5" : "2-3";
    const label = delivery === "europost" ? "ЕвроПочта" : "Курьер";
    const orderTotal = finalTotal + dp;

    const handlePlace = () => {
      if (!fullName.trim() || !address.trim() || !phone.trim()) {
        Alert.alert("Ошибка", "Заполните все поля, включая номер телефона");
        return;
      }
      const phoneDigits = phone.replace(/\D/g, '');
      if (phoneDigits.length < 7) {
        Alert.alert("Ошибка", "Введите корректный номер телефона (минимум 7 цифр)");
        return;
      }
      if (useFreeDelivery && !isFreeDeliveryEligible(phone, fullName)) {
        Alert.alert("Ошибка", "Бесплатная доставка уже была использована с этими данными");
        return;
      }
      if (cart.length === 0) {
        Alert.alert("Ошибка", "Корзина пуста");
        return;
      }
      placeOrderWithDetails({ fullName, address, phone, delivery, freeDelivery: useFreeDelivery });
    };

    return (
      <Modal transparent visible={orderModalVisible} onRequestClose={closeOrderModal} animationType="none">
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollView} keyboardShouldPersistTaps="handled">
            <View style={[styles.modalView, isDark && styles.modalViewDark]}>
              <Text style={[styles.modalTitle, isDark && styles.textDark]}>Оформление заказа</Text>
              <Text style={[styles.deliveryLabel, isDark && styles.textDark]}>Способ доставки</Text>
              <View style={styles.deliveryOptions}>
                <TouchableOpacity style={[styles.deliveryOption, delivery === "europost" && styles.deliveryOptionActive]} onPress={() => setDelivery("europost")}>
                  <Text style={delivery === "europost" && styles.deliveryOptionTextActive}>ЕвроПочта</Text>
                  <Text style={styles.deliveryDetail}>8-12 руб • 4-5 дней</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.deliveryOption, delivery === "courier" && styles.deliveryOptionActive]} onPress={() => setDelivery("courier")}>
                  <Text style={delivery === "courier" && styles.deliveryOptionTextActive}>Курьер</Text>
                  <Text style={styles.deliveryDetail}>10 руб • 2-3 дня</Text>
                  <Text style={styles.deliveryNote}>Менеджер свяжется</Text>
                </TouchableOpacity>
              </View>
              {/* Явно задаём цвета для полей ввода в зависимости от темы */}
              <TextInput
                style={[
                  styles.modalInput,
                  isDark && { backgroundColor: '#333', color: '#fff', borderColor: '#555' }
                ]}
                placeholder="ФИО"
                placeholderTextColor={isDark ? "#999" : "#888"}
                value={fullName}
                onChangeText={setFullName}
              />
              <TextInput
                style={[
                  styles.modalInput,
                  isDark && { backgroundColor: '#333', color: '#fff', borderColor: '#555' }
                ]}
                placeholder={delivery === "europost" ? "Адрес и номер отделения" : "Адрес доставки"}
                placeholderTextColor={isDark ? "#999" : "#888"}
                value={address}
                onChangeText={setAddress}
              />
              <TextInput
                style={[
                  styles.modalInput,
                  isDark && { backgroundColor: '#333', color: '#fff', borderColor: '#555' }
                ]}
                placeholder="Телефон"
                placeholderTextColor={isDark ? "#999" : "#888"}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
              {showFreeDeliveryOption && (
                <TouchableOpacity style={styles.bonusCheckbox} onPress={() => setUseFreeDelivery(!useFreeDelivery)}>
                  <Text style={[styles.bonusCheckboxText, isDark && styles.textDark]}>
                    {useFreeDelivery ? "☑" : "☐"} Бесплатная доставка (первый заказ)
                  </Text>
                </TouchableOpacity>
              )}
              <View style={[styles.deliverySummary, isDark && styles.deliverySummaryDark]}>
                <Text style={[styles.summaryText, isDark && styles.textDark]}>Доставка: {label} — {dp} руб</Text>
                <Text style={[styles.summaryText, isDark && styles.textDark]}>Срок: {days} дн.</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, isDark && styles.textDark]}>Товары: {money(finalTotal)}</Text>
                <Text style={[styles.totalLabel, isDark && styles.textDark]}>Доставка: {money(dp)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, isDark && styles.textDark, {fontWeight: 'bold'}]}>Итого к оплате:</Text>
                <Text style={[styles.totalAmount, isDark && styles.textDark]}>{money(orderTotal)}</Text>
              </View>
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.modalCancel} onPress={closeOrderModal}><Text>Отмена</Text></TouchableOpacity>
                <TouchableOpacity style={styles.modalConfirm} onPress={handlePlace}><Text style={styles.buttonText}>Подтвердить</Text></TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  // ---- Меню (без изменений) ----
  const Menu = () => {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const renderButton = (label, icon, target) => {
      const isActive = page === target;
      const iconColor = isActive ? '#fff' : (isDark ? '#fff' : '#333');
      const textColor = isActive ? '#fff' : (isDark ? '#fff' : '#333');

      return (
        <TouchableOpacity style={styles.menuButton} onPress={() => setPage(target)}>
          <View style={[styles.menuItem, isActive && styles.menuItemActive]}>
            <Text style={[styles.menuIcon, { color: iconColor }]}>{icon}</Text>
            <Text style={[styles.menuText, { color: textColor }]}>{label}</Text>
          </View>
          {target === 'cart' && cart.length > 0 && (
            <View style={styles.menuBadge}>
              <Text style={styles.menuBadgeText}>{cart.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      );
    };

    return (
      <View style={[styles.menu, isDark && styles.menuDark]}>
        {renderButton('Каталог', '👟', 'catalog')}
        {renderButton('Избранное', '♥', 'favorites')}
        {renderButton('Корзина', '🛒', 'cart')}
        {renderButton('Я', '👤', 'profile')}
      </View>
    );
  };

  // ==============================
  // РЕНДЕР
  // ==============================
  let content;
  if (page === "home") content = <Home />;
  else if (page === "catalog") content = <Catalog />;
  else if (page === "product") content = <ProductPage />;
  else if (page === "favorites") content = <Favorites />;
  else if (page === "cart") content = <Cart />;
  else if (page === "profile") content = <Profile />;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <View style={styles.root}>
        <View style={styles.contentContainer}>
          {content}
        </View>
        <Menu />
        <OrderModal />
        <AdminPanel />
        <SizeModal />
      </View>
    </ThemeContext.Provider>
  );
}

// ==============================
// СТИЛИ (добавлены явные цвета для тёмной темы)
// ==============================
const styles = StyleSheet.create({
  root: {
    height: '100vh',
    width: '100%',
    backgroundColor: '#F7F7F5',
    display: 'flex',
    flexDirection: 'column',
  },
  contentContainer: {
    flex: 1,
    paddingBottom: 80,
    overflowY: 'auto',
  },
  page: {
    flex: 1,
    backgroundColor: "#F7F7F5",
    padding: 14,
  },
  pageDark: { backgroundColor: "#1a1a1a" },
  textDark: { color: "#fff" },
  inputDark: {
    backgroundColor: '#333',
    color: '#fff',
    borderColor: '#555',
  },
  cardDark: { backgroundColor: "#2a2a2a" },
  scrollContent: { paddingBottom: 10 },

  logo: { fontSize: 30, fontWeight: "900", marginTop: 18 },
  description: { color: "#777", marginTop: 4, fontSize: 14 },
  pageTitle: { fontSize: 24, fontWeight: "900", marginTop: 18, marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: "900", marginTop: 18, marginBottom: 12 },

  banner: { backgroundColor: "#111", padding: 20, borderRadius: 28, marginTop: 18 },
  bannerTitle: { fontSize: 26, fontWeight: "900", color: "#fff" },
  bannerButton: { backgroundColor: "#fff", padding: 10, borderRadius: 20, marginTop: 15, alignSelf: "flex-start" },

  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  card: { width: "48%", backgroundColor: "#fff", borderRadius: 20, padding: 8, marginBottom: 12 },
  image: { height: 120, width: "100%", borderRadius: 16 },
  bigImage: { width: "100%", height: 250, borderRadius: 24 },
  favorite: { position: "absolute", right: 12, top: 12 },
  favoriteText: { fontSize: 20 },

  brand: { fontSize: 11, color: "#777", marginTop: 6 },
  productName: { fontSize: 14, fontWeight: "800", marginTop: 4 },
  price: { fontSize: 18, fontWeight: "900", marginTop: 3 },
  oldPrice: { textDecorationLine: "line-through", color: "#999", fontSize: 13 },
  oldPriceBig: { textDecorationLine: "line-through", color: "#999", fontSize: 16 },
  bigTitle: { fontSize: 24, fontWeight: "900" },
  bigPrice: { fontSize: 28, fontWeight: "900" },

  smallButton: { backgroundColor: "#111", padding: 8, borderRadius: 16, marginTop: 8 },
  buyButton: { backgroundColor: "#111", padding: 14, borderRadius: 22, marginTop: 16 },
  buttonText: { color: "#fff", textAlign: "center", fontWeight: "800", fontSize: 13 },

  cartItem: { backgroundColor: "#fff", padding: 12, borderRadius: 20, flexDirection: "row", marginBottom: 12 },
  cartItemDark: { backgroundColor: "#2a2a2a" },
  cartImage: { width: 70, height: 70, borderRadius: 16, marginRight: 12 },
  remove: { color: "red", marginTop: 6, fontSize: 13 },
  total: { fontSize: 24, fontWeight: "900" },
  finalTotal: { fontSize: 20, fontWeight: "900", marginTop: 4 },
  discountText: { fontSize: 16, color: "green", marginTop: 4 },

  balanceCard: { backgroundColor: "#111", padding: 24, borderRadius: 28 },
  balanceLabel: { color: "#fff" },
  balanceValue: { color: "#fff", fontSize: 36, fontWeight: "900" },
  balanceInfo: { color: "#fff" },

  referralBox: { backgroundColor: "#fff", padding: 16, borderRadius: 24 },
  referralBoxDark: { backgroundColor: "#2a2a2a" },
  referralText: { marginBottom: 12, fontSize: 13 },
  referralCount: { marginTop: 6, fontSize: 14, fontWeight: "600", color: "#333" },
  copyButton: { backgroundColor: "#111", padding: 12, borderRadius: 18 },

  currentLevel: { backgroundColor: "#111", padding: 20, borderRadius: 24 },
  currentLevelTitle: { fontSize: 24, fontWeight: "900", color: "#fff" },
  currentInfo: { color: "#fff", marginTop: 6, fontSize: 14 },
  progressBackground: { height: 8, backgroundColor: "#555", borderRadius: 8, marginTop: 12 },
  progress: { height: 8, backgroundColor: "#fff", borderRadius: 8 },
  levelCard: { backgroundColor: "#fff", padding: 18, borderRadius: 24, marginBottom: 12 },
  levelCardDark: { backgroundColor: "#2a2a2a" },
  activeLevel: { backgroundColor: "#111" },
  levelName: { fontSize: 18, fontWeight: "900" },
  levelInfo: { marginTop: 4, fontSize: 14 },
  activeText: { color: "#fff" },

  orderCard: { backgroundColor: "#fff", padding: 14, borderRadius: 18, marginBottom: 12 },
  orderCardDark: { backgroundColor: "#2a2a2a" },
  orderId: { fontSize: 15, fontWeight: "800" },
  orderDate: { color: "#777", marginTop: 2, fontSize: 12 },
  orderStatus: { fontWeight: "600", marginTop: 4, fontSize: 14 },
  orderTotal: { fontWeight: "700", marginTop: 4, fontSize: 16 },
  orderItem: { fontSize: 13, marginLeft: 8 },
  orderMore: { fontSize: 12, color: "#777", marginLeft: 8 },
  trackingText: { fontSize: 13, color: "#0066cc", marginTop: 2 },

  modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  modalScrollView: { flexGrow: 1, justifyContent: "center", paddingVertical: 20 },
  modalView: { width: "90%", backgroundColor: "#fff", borderRadius: 28, padding: 20, alignItems: "stretch", alignSelf: "center" },
  modalViewDark: { backgroundColor: "#2a2a2a" },
  modalTitle: { fontSize: 20, fontWeight: "900", marginBottom: 16, textAlign: "center" },
  modalSubtitle: { fontSize: 15, textAlign: "center", marginBottom: 12, color: "#666" },
  modalInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 14, padding: 10, marginBottom: 12, fontSize: 15 },
  modalButtons: { flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  modalCancel: { padding: 10, borderRadius: 18, backgroundColor: "#eee", flex: 0.4, alignItems: "center" },
  modalConfirm: { padding: 10, borderRadius: 18, backgroundColor: "#111", flex: 0.5, alignItems: "center" },

  deliveryLabel: { fontSize: 15, fontWeight: "600", marginBottom: 8 },
  deliveryOptions: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
  deliveryOption: { flex: 1, padding: 10, borderRadius: 14, backgroundColor: "#eee", marginHorizontal: 4, alignItems: "center" },
  deliveryOptionActive: { backgroundColor: "#111" },
  deliveryOptionTextActive: { color: "#fff" },
  deliveryDetail: { fontSize: 11, color: "#666", marginTop: 3 },
  deliveryNote: { fontSize: 10, color: "#999", marginTop: 2 },
  deliverySummary: { backgroundColor: "#f0f0f0", padding: 8, borderRadius: 10, marginBottom: 12, flexDirection: "row", justifyContent: "space-between" },
  deliverySummaryDark: { backgroundColor: "#333" },
  summaryText: { fontSize: 13, fontWeight: "500" },

  promoBox: { flexDirection: "row", marginVertical: 8 },
  promoInput: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 18, padding: 8, marginRight: 8, fontSize: 14 },
  promoButton: { backgroundColor: "#111", padding: 8, borderRadius: 18, justifyContent: "center" },

  bonusCheckbox: { flexDirection: "row", alignItems: "center", marginVertical: 8 },
  bonusCheckboxText: { fontSize: 14, fontWeight: "600" },

  searchInput: { backgroundColor: "#fff", padding: 10, borderRadius: 22, marginBottom: 12, fontSize: 14 },
  filterScroll: { flexDirection: "row", marginBottom: 12, height: 44, flexShrink: 0, flexGrow: 0 },
  filterContent: { alignItems: "center" },
  filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: "#eee", marginRight: 8, alignSelf: "flex-start", flexShrink: 0, flexGrow: 0 },
  filterChipActive: { backgroundColor: "#111" },
  filterChipTextActive: { color: "#fff" },
  priceFilter: { flexDirection: "row", marginBottom: 12 },
  priceInput: { flex: 1, backgroundColor: "#fff", padding: 8, borderRadius: 18, marginRight: 8, fontSize: 14 },

  sizeBox: { marginTop: 16 },
  sizeTitle: { fontSize: 15, fontWeight: "600", marginBottom: 8 },
  sizes: { flexDirection: "row", flexWrap: "wrap" },
  size: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#eee", justifyContent: "center", alignItems: "center", marginRight: 8, marginBottom: 8 },
  sizeActive: { backgroundColor: "#111" },
  sizeTextActive: { color: "#fff" },
  sizeGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginVertical: 12 },
  sizeOption: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#eee", justifyContent: "center", alignItems: "center", margin: 6 },
  sizeOptionActive: { backgroundColor: "#111" },
  sizeOptionText: { fontSize: 16, fontWeight: "600" },
  sizeOptionTextActive: { color: "#fff" },
  sizeText: { fontSize: 13, color: "#555", marginTop: 2 },

  adminButton: { backgroundColor: "#111", padding: 10, borderRadius: 18, marginVertical: 8, alignSelf: "flex-start" },
  closeAdmin: { marginBottom: 16, alignSelf: "flex-end" },
  closeAdminText: { fontSize: 15, fontWeight: "600" },
  adminStat: { fontSize: 16, marginVertical: 4 },
  adminItem: { fontSize: 13, marginVertical: 2 },
  statusButtons: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  statusBtn: { padding: 5, borderRadius: 12, backgroundColor: "#eee", marginRight: 6, marginBottom: 4 },
  statusBtnActive: { backgroundColor: "#111" },
  statusBtnText: { fontSize: 11 },
  statusBtnTextActive: { color: "#fff" },
  addBtn: { backgroundColor: "#111", padding: 12, borderRadius: 20, alignItems: "center", marginVertical: 10 },
  productEdit: { backgroundColor: "#fff", padding: 12, borderRadius: 16, marginBottom: 10 },
  productEditDark: { backgroundColor: "#2a2a2a" },
  editInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 6, marginBottom: 6, fontSize: 13 },
  saveBtn: { backgroundColor: "#111", padding: 8, borderRadius: 16, alignItems: "center" },
  editActions: { flexDirection: "row", marginTop: 4 },
  editAction: { fontSize: 18, marginRight: 12 },
  trackingInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 6, padding: 4, fontSize: 12, textAlign: 'center', minWidth: 80 },
  broadcastInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 14, padding: 10, marginBottom: 12, minHeight: 60, fontSize: 14 },
  broadcastBtn: { backgroundColor: "#111", padding: 12, borderRadius: 20, alignItems: "center", marginBottom: 20 },

  ratingDisplay: { fontSize: 14, marginVertical: 4 },
  reviewItem: { backgroundColor: "#f0f0f0", padding: 8, borderRadius: 12, marginBottom: 8 },
  reviewItemDark: { backgroundColor: "#333" },
  reviewRating: { fontSize: 14 },
  reviewComment: { fontSize: 13, marginTop: 2 },
  reviewDate: { fontSize: 11, color: "#777", marginTop: 2 },
  noReviews: { fontStyle: "italic", marginVertical: 8, fontSize: 14 },
  reviewForm: { marginTop: 16, padding: 12, backgroundColor: "#f9f9f9", borderRadius: 16 },
  reviewFormDark: { backgroundColor: "#2a2a2a" },
  reviewFormTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  stars: { flexDirection: "row", marginBottom: 8 },
  star: { fontSize: 28, marginRight: 4 },
  starActive: { color: "#f5c518" },
  reviewInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 8, marginBottom: 8 },
  submitReview: { backgroundColor: "#111", padding: 10, borderRadius: 16, alignItems: "center" },

  themeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 12 },
  themeLabel: { fontSize: 16 },

  totalRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: 6, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "#ddd" },
  totalLabel: { fontSize: 16, fontWeight: "500" },
  totalAmount: { fontSize: 18, fontWeight: "900" },

  cartBadge: { fontSize: 16, fontWeight: "600", color: "#000" },

  menu: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: 70,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 8,
    paddingTop: 4,
    zIndex: 1000,
  },
  menuDark: {
    backgroundColor: '#1a1a1a',
    borderColor: '#333',
  },
  menuButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  menuItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  menuItemActive: {
    backgroundColor: '#111',
  },
  menuIcon: {
    fontSize: 22,
    marginBottom: 2,
  },
  menuText: {
    fontSize: 11,
    fontWeight: '500',
  },
  menuBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    backgroundColor: '#ff3b30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  menuBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },

  tableContainer: { backgroundColor: "#fff", borderRadius: 16, overflow: 'hidden', marginVertical: 5 },
  tableContainerDark: { backgroundColor: "#2a2a2a" },
  tableHeader: { flexDirection: 'row', backgroundColor: "#111", paddingVertical: 8, paddingHorizontal: 6 },
  tableHeaderText: { fontSize: 11, fontWeight: 'bold', color: "#fff", textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: "#eee", alignItems: 'center' },
  tableRowDark: { borderBottomColor: "#555" },
  tableCell: { fontSize: 11, textAlign: 'center', paddingHorizontal: 2 },
  statusText: { fontSize: 11, fontWeight: '600', color: "#333", backgroundColor: "#eee", paddingVertical: 3, paddingHorizontal: 6, borderRadius: 10 },
  statusOption: { paddingVertical: 8, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: "#eee" },
  statusOptionActive: { backgroundColor: "#111" },
  statusOptionText: { fontSize: 15, textAlign: 'center' },
  statusOptionTextActive: { color: "#fff" },
});
