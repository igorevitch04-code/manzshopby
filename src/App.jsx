import React, { useState, useEffect, createContext, useContext } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Alert,
  TextInput, Clipboard, FlatList, Modal, Share, Switch
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const tg = typeof window !== "undefined" && window.Telegram?.WebApp;
const ThemeContext = createContext();
const useTheme = () => useContext(ThemeContext);

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

// CloudStorage (без изменений)
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

// Toast компонент
const Toast = ({ message, visible, onHide }) => {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        onHide();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [visible, onHide]);

  if (!visible) return null;

  return (
    <View style={styles.toastContainer}>
      <View style={styles.toast}>
        <Text style={styles.toastText}>{message}</Text>
      </View>
    </View>
  );
};

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

  const [sizeModalVisible, setSizeModalVisible] = useState(false);
  const [sizeModalProduct, setSizeModalProduct] = useState(null);
  const [tempSelectedSize, setTempSelectedSize] = useState(null);

  // Toast
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const showToast = (msg) => {
    setToastMessage(msg);
    setToastVisible(true);
  };

  const hideToast = () => {
    setToastVisible(false);
  };

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
    usedFreeDelivery: "@krost_usedFreeDelivery"
  };
  const CLOUD_KEYS = {
    cart: "krost_cart",
    favorites: "krost_favorites",
    orders: "krost_orders",
    bonus: "krost_bonus",
    orderHistory: "krost_orderHistory",
    lastOrderNumber: "krost_lastOrderNumber",
    usedFreeDelivery: "krost_usedFreeDelivery"
  };

  // Загрузка данных
  useEffect(() => {
    const loadAll = async () => {
      try {
        const [c, f, o, b, h, p, t, a, ln, u, pc, ufd] = await AsyncStorage.multiGet([
          STORAGE_KEYS.cart, STORAGE_KEYS.favorites, STORAGE_KEYS.orders, STORAGE_KEYS.bonus,
          STORAGE_KEYS.orderHistory, STORAGE_KEYS.products, STORAGE_KEYS.theme, STORAGE_KEYS.adminOrders,
          STORAGE_KEYS.lastOrderNumber, STORAGE_KEYS.users, STORAGE_KEYS.promoCodes, STORAGE_KEYS.usedFreeDelivery
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

        const cloudCart = await loadFromCloud(CLOUD_KEYS.cart);
        const cloudFavorites = await loadFromCloud(CLOUD_KEYS.favorites);
        const cloudOrders = await loadFromCloud(CLOUD_KEYS.orders);
        const cloudBonus = await loadFromCloud(CLOUD_KEYS.bonus);
        const cloudOrderHistory = await loadFromCloud(CLOUD_KEYS.orderHistory);
        const cloudLastOrderNumber = await loadFromCloud(CLOUD_KEYS.lastOrderNumber);
        const cloudUsedFreeDelivery = await loadFromCloud(CLOUD_KEYS.usedFreeDelivery);

        if (cloudCart !== null) localCart = cloudCart;
        if (cloudFavorites !== null) localFavorites = cloudFavorites;
        if (cloudOrders !== null) localOrders = cloudOrders;
        if (cloudBonus !== null) localBonus = cloudBonus;
        if (cloudOrderHistory !== null) localOrderHistory = cloudOrderHistory;
        if (cloudLastOrderNumber !== null) localLastOrderNumber = cloudLastOrderNumber;
        if (cloudUsedFreeDelivery !== null) localUsedFreeDelivery = cloudUsedFreeDelivery;

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
      } catch (e) { console.warn("Ошибка загрузки", e); }
    };
    loadAll();
  }, []);

  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart)); saveToCloud(CLOUD_KEYS.cart, cart); }, [cart]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favorites)); saveToCloud(CLOUD_KEYS.favorites, favorites); }, [favorites]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(orders)); saveToCloud(CLOUD_KEYS.orders, orders); }, [orders]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.bonus, JSON.stringify(bonusBalance)); saveToCloud(CLOUD_KEYS.bonus, bonusBalance); }, [bonusBalance]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.orderHistory, JSON.stringify(orderHistory)); saveToCloud(CLOUD_KEYS.orderHistory, orderHistory); }, [orderHistory]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.lastOrderNumber, JSON.stringify(lastOrderNumber)); saveToCloud(CLOUD_KEYS.lastOrderNumber, lastOrderNumber); }, [lastOrderNumber]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.usedFreeDelivery, JSON.stringify(usedFreeDelivery)); saveToCloud(CLOUD_KEYS.usedFreeDelivery, usedFreeDelivery); }, [usedFreeDelivery]);

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
  const referral = `https://t.me/krost_shop_bot?start=${user.id}`;

  const addCart = (item) => setCart([...cart, item]);
  const removeCart = (idx) => setCart(cart.filter((_, i) => i !== idx));

  const toggleFavorite = (item) => {
    favorites.some(x => x.id === item.id)
      ? setFavorites(favorites.filter(x => x.id !== item.id))
      : setFavorites([...favorites, item]);
  };

  const copyReferral = () => { Clipboard.setString(referral); Alert.alert("Готово", "Ссылка скопирована"); };
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
    showToast(`✅ Заказ #${nextNumber} оформлен`);
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
    try { await Share.share({ message: `${product.brand} ${product.name} - ${money(product.price)}\nhttps://t.me/krost_shop_bot?start=product_${product.id}` }); } catch (e) {}
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
  const changeStatus = (orderId, newStatus) => {
    setAdminOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    setOrderHistory(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
  };
  const updateTracking = (orderId, trackingNumber) => {
    setAdminOrders(prev => prev.map(o => o.id === orderId ? { ...o, trackingNumber } : o));
    setOrderHistory(prev => prev.map(o => o.id === orderId ? { ...o, trackingNumber } : o));
  };
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
  // КОМПОНЕНТЫ СТРАНИЦ
  // ==============================

  const SizeModal = () => null;

  const ProductCard = ({ item }) => {
    const isFav = favorites.some(x => x.id === item.id);
    const { theme } = useTheme();
    const isDark = theme === "dark";

    return (
      <View style={[styles.card, isDark && styles.cardDark]}>
        <TouchableOpacity 
          onPress={() => { 
            setSelectedProduct(item); 
            setSelectedSize(null); 
            setPage("product"); 
          }}
        >
          <Image source={{ uri: item.image }} style={styles.image} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.favorite} onPress={() => toggleFavorite(item)}>
          <Text style={styles.favoriteText}>{isFav ? "♥" : "♡"}</Text>
        </TouchableOpacity>
        
        <Text style={[styles.brand, isDark && styles.textDark]}>{item.brand}</Text>
        <Text style={[styles.productName, isDark && styles.textDark]}>{item.name}</Text>
        
        {item.oldPrice && <Text style={styles.oldPrice}>{money(item.oldPrice)}</Text>}
        <Text style={[styles.price, isDark && styles.textDark]}>{money(item.price)}</Text>
      </View>
    );
  };

  const Home = () => {
    const popularItems = [...products].sort((a,b) => b.sales - a.sales).slice(0,4);
    const recommended = getRecommended();
    const { theme } = useTheme(); const isDark = theme === "dark";
    return (
      <ScrollView style={[styles.page, isDark && styles.pageDark]} contentContainerStyle={styles.scrollContent}>
        <TouchableOpacity onLongPress={toggleAdmin}>
          <Text style={[styles.logo, isDark && styles.textDark]}>KROST</Text>
        </TouchableOpacity>
        <Text style={[styles.description, isDark && styles.textDark]}>Магазин кроссовок и одежды</Text>
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Новые коллекции</Text>
          <TouchableOpacity style={styles.bannerButton} onPress={() => setPage("catalog")}>
            <Text>Открыть каталог</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Популярное</Text>
        <View style={styles.grid}>
          {popularItems.map(item => <ProductCard key={item.id} item={item} />)}
        </View>
        {recommended.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Вам может понравиться</Text>
            <View style={styles.grid}>
              {recommended.map(item => <ProductCard key={item.id} item={item} />)}
            </View>
          </>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    );
  };

  const Catalog = () => {
    const brands = getBrands(products);
    const { theme } = useTheme(); const isDark = theme === "dark";
    return (
      <View style={[styles.page, isDark && styles.pageDark]}>
        <Text style={[styles.pageTitle, isDark && styles.textDark]}>Каталог</Text>
        <TextInput style={[styles.searchInput, isDark && styles.inputDark]} placeholder="Поиск..." placeholderTextColor={isDark ? "#999" : "#888"} value={searchQuery} onChangeText={setSearchQuery} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
          <TouchableOpacity style={[styles.filterChip, selectedBrand === null && styles.filterChipActive]} onPress={() => setSelectedBrand(null)}>
            <Text style={selectedBrand === null && styles.filterChipTextActive}>Все</Text>
          </TouchableOpacity>
          {brands.map(b => (
            <TouchableOpacity key={b} style={[styles.filterChip, selectedBrand === b && styles.filterChipActive]} onPress={() => setSelectedBrand(b)}>
              <Text style={selectedBrand === b && styles.filterChipTextActive}>{b}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.priceFilter}>
          <TextInput style={[styles.priceInput, isDark && styles.inputDark]} placeholder="Цена от" placeholderTextColor={isDark ? "#999" : "#888"} value={minPrice} onChangeText={setMinPrice} keyboardType="numeric" />
          <TextInput style={[styles.priceInput, isDark && styles.inputDark]} placeholder="до" placeholderTextColor={isDark ? "#999" : "#888"} value={maxPrice} onChangeText={setMaxPrice} keyboardType="numeric" />
        </View>
        <FlatList
          data={paginated}
          renderItem={({item}) => <ProductCard item={item} />}
          keyExtractor={item => item.id.toString()}
          numColumns={2}
          columnWrapperStyle={styles.grid}
          contentContainerStyle={{ paddingBottom: 20 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <Text style={[styles.loader, isDark && styles.textDark]}>Загрузка...</Text> : null}
          ListEmptyComponent={<Text style={[styles.empty, isDark && styles.textDark]}>Товаров нет</Text>}
        />
      </View>
    );
  };

  const ProductPage = () => {
    if (!selectedProduct) return null;
    const { theme } = useTheme(); 
    const isDark = theme === "dark";
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState("");
    const hasPurchased = orderHistory.some(order => order.items.some(i => i.id === selectedProduct.id));

    const handleAddToCart = () => {
      if (!selectedSize) {
        showToast("⚠️ Выберите размер");
        return;
      }
      addCart({ ...selectedProduct, size: selectedSize });
      showToast(`✅ ${selectedProduct.name} (${selectedSize}) добавлен`);
    };

    const submitRating = () => {
      if (rating === 0) { 
        Alert.alert("Ошибка", "Поставьте оценку"); 
        return; 
      }
      addRating(selectedProduct.id, rating, comment);
      setRating(0); 
      setComment("");
      Alert.alert("Спасибо", "Отзыв добавлен");
    };

    return (
      <ScrollView style={[styles.page, isDark && styles.pageDark]} contentContainerStyle={styles.scrollContent}>
        <View style={styles.productHeader}>
          <TouchableOpacity onPress={() => setPage("catalog")}>
            <Text style={[styles.back, isDark && styles.textDark]}>← Назад</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => shareProduct(selectedProduct)}>
            <Text style={[styles.shareBtn, isDark && styles.textDark]}>📤</Text>
          </TouchableOpacity>
        </View>
        <Image source={{ uri: selectedProduct.image }} style={styles.bigImage} />
        <Text style={[styles.brand, isDark && styles.textDark]}>{selectedProduct.brand}</Text>
        <Text style={[styles.bigTitle, isDark && styles.textDark]}>{selectedProduct.name}</Text>
        {selectedProduct.oldPrice && <Text style={styles.oldPriceBig}>{money(selectedProduct.oldPrice)}</Text>}
        <Text style={[styles.bigPrice, isDark && styles.textDark]}>{money(selectedProduct.price)}</Text>
        {selectedProduct.description && <Text style={[styles.descriptionText, isDark && styles.textDark]}>{selectedProduct.description}</Text>}
        {selectedProduct.averageRating > 0 && (
          <Text style={[styles.ratingDisplay, isDark && styles.textDark]}>⭐ {selectedProduct.averageRating.toFixed(1)} ({selectedProduct.ratings.length} отзывов)</Text>
        )}

        <View style={styles.sizeBox}>
          <Text style={[styles.sizeTitle, isDark && styles.textDark]}>Выберите размер</Text>
          <View style={styles.sizes}>
            {(selectedProduct.sizes || ["40","41","42","43","44"]).map(size => (
              <TouchableOpacity
                key={size}
                style={[styles.size, selectedSize === size && styles.sizeActive]}
                onPress={() => setSelectedSize(size)}
              >
                <Text style={selectedSize === size && styles.sizeTextActive}>{size}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity style={styles.buyButton} onPress={handleAddToCart}>
          <Text style={styles.buttonText}>Добавить в корзину</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Отзывы</Text>
        {selectedProduct.ratings.length > 0 ? (
          selectedProduct.ratings.slice(0, 5).map((r, idx) => (
            <View key={idx} style={[styles.reviewItem, isDark && styles.reviewItemDark]}>
              <Text style={[styles.reviewRating, isDark && styles.textDark]}>{"⭐".repeat(r.rating)}</Text>
              <Text style={[styles.reviewComment, isDark && styles.textDark]}>{r.comment}</Text>
              <Text style={[styles.reviewDate, isDark && styles.textDark]}>{new Date(r.date).toLocaleDateString()}</Text>
            </View>
          ))
        ) : <Text style={[styles.noReviews, isDark && styles.textDark]}>Пока нет отзывов</Text>}

        {hasPurchased && (
          <View style={[styles.reviewForm, isDark && styles.reviewFormDark]}>
            <Text style={[styles.reviewFormTitle, isDark && styles.textDark]}>Оставить отзыв</Text>
            <View style={styles.stars}>
              {[1,2,3,4,5].map(s => (
                <TouchableOpacity key={s} onPress={() => setRating(s)}>
                  <Text style={[styles.star, rating >= s && styles.starActive]}>{s <= rating ? "⭐" : "☆"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={[styles.reviewInput, isDark && styles.inputDark]} placeholder="Ваш комментарий..." placeholderTextColor={isDark ? "#999" : "#888"} value={comment} onChangeText={setComment} />
            <TouchableOpacity style={styles.submitReview} onPress={submitRating}>
              <Text style={styles.buttonText}>Отправить</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    );
  };

  const Favorites = () => {
    const { theme } = useTheme(); const isDark = theme === "dark";
    return (
      <ScrollView style={[styles.page, isDark && styles.pageDark]} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.pageTitle, isDark && styles.textDark]}>Избранное</Text>
        {favorites.length === 0 ? (
          <Text style={[styles.empty, isDark && styles.textDark]}>Нет сохраненных товаров</Text>
        ) : (
          <View style={styles.grid}>
            {favorites.map(item => <ProductCard key={item.id} item={item} />)}
          </View>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    );
  };

  const Cart = () => {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const { total, discount, usedBonus, finalTotal } = calculateTotals();
    const [promoInput, setPromoInput] = useState("");

    const applyPromo = () => {
      const code = promoInput.trim();
      if (!code) { Alert.alert("Ошибка", "Введите промокод"); return; }
      const found = promoCodes.find(p => p.code.toUpperCase() === code.toUpperCase() && p.active);
      if (found) {
        setPromoCode(code);
        Alert.alert("Промокод применён", `Скидка: ${money(total * (found.discount / 100))}`);
      } else {
        Alert.alert("Ошибка", "Неверный или неактивный промокод");
      }
    };

    return (
      <ScrollView style={[styles.page, isDark && styles.pageDark]} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.pageTitle, isDark && styles.textDark]}>
          Корзина{cart.length > 0 && <Text style={styles.cartBadge}> ({cart.length})</Text>}
        </Text>
        {cart.length === 0 ? (
          <Text style={[styles.empty, isDark && styles.textDark]}>Корзина пустая</Text>
        ) : (
          <>
            {cart.map((item, idx) => (
              <View style={[styles.cartItem, isDark && styles.cartItemDark]} key={idx}>
                <Image source={{ uri: item.image }} style={styles.cartImage} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.productName, isDark && styles.textDark]}>{item.name}</Text>
                  {item.size && <Text style={[styles.sizeText, isDark && styles.textDark]}>Размер: {item.size}</Text>}
                  {!item.size && <Text style={[styles.sizeText, {color: 'red'}]}>⚠️ Размер не выбран</Text>}
                  <Text style={[styles.price, isDark && styles.textDark]}>{money(item.price)}</Text>
                  <TouchableOpacity onPress={() => removeCart(idx)}><Text style={styles.remove}>Удалить</Text></TouchableOpacity>
                </View>
              </View>
            ))}

            <View style={styles.promoBox}>
              <TextInput
                style={[styles.promoInput, isDark && styles.inputDark]}
                placeholder="Промокод"
                placeholderTextColor={isDark ? "#999" : "#888"}
                value={promoInput}
                onChangeText={setPromoInput}
              />
              <TouchableOpacity style={styles.promoButton} onPress={applyPromo}>
                <Text style={styles.buttonText}>Применить</Text>
              </TouchableOpacity>
            </View>
            {discount > 0 && <Text style={[styles.discountText, isDark && styles.textDark]}>Скидка: -{money(discount)}</Text>}
            {bonusBalance > 0 && (
              <TouchableOpacity style={styles.bonusCheckbox} onPress={() => setUseBonus(!useBonus)}>
                <Text style={[styles.bonusCheckboxText, isDark && styles.textDark]}>
                  {useBonus ? "☑" : "☐"} Использовать бонусы ({money(Math.min(bonusBalance, total - discount))})
                </Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.total, isDark && styles.textDark]}>Итого: {money(total)}</Text>
            {discount > 0 && <Text style={[styles.discountText, isDark && styles.textDark]}>Скидка: -{money(discount)}</Text>}
            {useBonus && usedBonus > 0 && <Text style={[styles.discountText, isDark && styles.textDark]}>Бонусы: -{money(usedBonus)}</Text>}
            <Text style={[styles.finalTotal, isDark && styles.textDark]}>К оплате: {money(finalTotal)}</Text>
            <TouchableOpacity style={styles.buyButton} onPress={openOrderModal}>
              <Text style={styles.buttonText}>Оформить заказ</Text>
            </TouchableOpacity>
          </>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    );
  };

  const Profile = () => {
    const { theme, toggleTheme } = useTheme(); const isDark = theme === "dark";
    return (
      <ScrollView style={[styles.page, isDark && styles.pageDark]} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.pageTitle, isDark && styles.textDark]}>Профиль</Text>
        <Text style={[styles.userName, isDark && styles.textDark]}>Привет, {user.name} 👋</Text>
        {isAdmin && (
          <TouchableOpacity style={styles.adminButton} onPress={() => setShowAdmin(true)}>
            <Text style={styles.buttonText}>⚙️ Админ-панель</Text>
          </TouchableOpacity>
        )}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>БОНУСНЫЙ СЧЕТ</Text>
          <Text style={styles.balanceValue}>{money(bonusBalance)}</Text>
          <Text style={styles.balanceInfo}>Кэшбэк {currentLevel.cashback}%</Text>
        </View>
        <View style={styles.themeRow}>
          <Text style={[styles.themeLabel, isDark && styles.textDark]}>Тёмная тема</Text>
          <Switch value={theme === "dark"} onValueChange={toggleTheme} />
        </View>
        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Ваша ссылка</Text>
        <View style={[styles.referralBox, isDark && styles.referralBoxDark]}>
          <Text style={[styles.referralText, isDark && styles.textDark]}>{referral}</Text>
          <TouchableOpacity style={styles.copyButton} onPress={copyReferral}>
            <Text style={styles.buttonText}>📋 Скопировать ссылку</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Ваш уровень</Text>
        <View style={styles.currentLevel}>
          <Text style={styles.currentLevelTitle}>{currentLevel.name}</Text>
          <Text style={styles.currentInfo}>Заказов: {orders}</Text>
          <Text style={styles.currentInfo}>Кэшбэк: {currentLevel.cashback}%</Text>
          {nextLevel && (
            <>
              <Text style={styles.currentInfo}>До {nextLevel.name}:</Text>
              <Text style={styles.currentInfo}>Осталось {nextLevel.min - orders} заказов</Text>
              <View style={styles.progressBackground}><View style={[styles.progress, { width: `${progress}%` }]} /></View>
              <Text style={styles.currentInfo}>{progress}%</Text>
            </>
          )}
          {!nextLevel && <Text style={styles.currentInfo}>Максимальный уровень</Text>}
        </View>
        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Все уровни</Text>
        {LEVELS.map(item => (
          <View key={item.name} style={[styles.levelCard, item.name === currentLevel.name && styles.activeLevel, isDark && styles.levelCardDark]}>
            <Text style={[styles.levelName, item.name === currentLevel.name && styles.activeText, isDark && styles.textDark]}>{item.name}</Text>
            <Text style={[styles.levelInfo, item.name === currentLevel.name && styles.activeText, isDark && styles.textDark]}>
              {item.min} - {item.max === 999 ? "∞" : item.max} заказов • {item.cashback}%
            </Text>
          </View>
        ))}
        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>История заказов</Text>
        {orderHistory.length === 0 ? (
          <Text style={[styles.empty, isDark && styles.textDark]}>Заказов пока нет</Text>
        ) : (
          orderHistory.map(order => (
            <View key={order.id} style={[styles.orderCard, isDark && styles.orderCardDark]}>
              <Text style={[styles.orderId, isDark && styles.textDark]}>Заказ #{order.id}</Text>
              <Text style={[styles.orderDate, isDark && styles.textDark]}>{new Date(order.date).toLocaleDateString()}</Text>
              <Text style={[styles.orderStatus, isDark && styles.textDark]}>Статус: {order.status}</Text>
              {order.trackingNumber && <Text style={[styles.trackingText, isDark && styles.textDark]}>Трек-номер: {order.trackingNumber}</Text>}
              <Text style={[styles.orderTotal, isDark && styles.textDark]}>Сумма: {money(order.finalTotal)}</Text>
              {order.items.slice(0, 3).map((item, i) => (
                <Text key={i} style={[styles.orderItem, isDark && styles.textDark]}>• {item.name} x1</Text>
              ))}
              {order.items.length > 3 && <Text style={[styles.orderMore, isDark && styles.textDark]}>и ещё {order.items.length - 3}...</Text>}
            </View>
          ))
        )}
        <View style={{ height: 20 }} />
      </ScrollView>
    );
  };

  const AdminPanel = () => {
    const { theme } = useTheme(); 
    const isDark = theme === "dark";
    if (!showAdmin || !isAdmin) return null;

    const today = new Date().toISOString().split('T')[0];
    const todayRevenue = adminOrders
      .filter(o => o.date.startsWith(today))
      .reduce((sum, o) => sum + o.finalTotal, 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    const monthRevenue = adminOrders
      .filter(o => new Date(o.date) >= monthStart)
      .reduce((sum, o) => sum + o.finalTotal, 0);

    return (
      <Modal visible={showAdmin} animationType="slide" transparent={false}>
        <View style={[styles.page, isDark && styles.pageDark, {paddingTop: 40}]}>
          <TouchableOpacity onPress={() => setShowAdmin(false)} style={styles.closeAdmin}>
            <Text style={[styles.closeAdminText, isDark && styles.textDark]}>✕ Закрыть админку</Text>
          </TouchableOpacity>

          <ScrollView 
            style={{ flex: 1 }} 
            contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          >
            <Text style={[styles.pageTitle, isDark && styles.textDark]}>Админ-панель</Text>

            <View style={[styles.adminStatCard, isDark && styles.adminStatCardDark]}>
              <Text style={[styles.adminStat, isDark && styles.textDark]}>Сегодня: {money(todayRevenue)}</Text>
              <Text style={[styles.adminStat, isDark && styles.textDark]}>За месяц: {money(monthRevenue)}</Text>
              <Text style={[styles.adminStat, isDark && styles.textDark]}>Всего заказов: {adminOrders.length}</Text>
            </View>

            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Управление заказами</Text>
            {adminOrders.map(order => (
              <View key={order.id} style={[styles.orderCard, isDark && styles.orderCardDark]}>
                <Text style={[styles.orderId, isDark && styles.textDark]}>
                  #{order.id} — {order.fullName} • {new Date(order.date).toLocaleDateString()}
                </Text>
                <Text style={[styles.orderStatus, isDark && styles.textDark]}>Статус: {order.status}</Text>

                {order.delivery === "europost" && (
                  <TextInput
                    style={[styles.trackingInput, isDark && styles.inputDark]}
                    placeholder="Трек-номер"
                    placeholderTextColor={isDark ? "#999" : "#888"}
                    value={order.trackingNumber || ""}
                    onChangeText={text => updateTracking(order.id, text)}
                  />
                )}

                <View style={styles.statusButtons}>
                  {ORDER_STATUSES.map(s => (
                    <TouchableOpacity 
                      key={s} 
                      style={[styles.statusBtn, order.status === s && styles.statusBtnActive]} 
                      onPress={() => changeStatus(order.id, s)}
                    >
                      <Text style={[styles.statusBtnText, order.status === s && styles.statusBtnTextActive]}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}

            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Управление промокодами</Text>
            <TouchableOpacity style={styles.addBtn} onPress={addPromoCode}>
              <Text style={styles.buttonText}>+ Добавить промокод</Text>
            </TouchableOpacity>
            {promoCodes.map((promo, index) => (
              <View key={index} style={[styles.productEdit, isDark && styles.productEditDark]}>
                <Text style={[styles.productName, isDark && styles.textDark]}>
                  {promo.code} — {promo.discount}% {promo.active ? '✅' : '❌'}
                </Text>
                <Text style={[styles.brand, isDark && styles.textDark]}>{promo.description}</Text>
                <View style={styles.editActions}>
                  <TouchableOpacity onPress={() => togglePromoActive(index)}>
                    <Text style={[styles.editAction, {color: promo.active ? 'green' : 'red'}]}>
                      {promo.active ? 'Деактивировать' : 'Активировать'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deletePromoCode(index)}>
                    <Text style={[styles.editAction, {color: 'red'}]}>🗑 Удалить</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Управление товарами</Text>
            <TouchableOpacity style={styles.addBtn} onPress={addProduct}>
              <Text style={styles.buttonText}>+ Добавить товар</Text>
            </TouchableOpacity>
            {products.map(p => (
              <View key={p.id} style={[styles.productEdit, isDark && styles.productEditDark]}>
                {editingProduct === p.id ? (
                  <>
                    <TextInput style={[styles.editInput, isDark && styles.inputDark]} value={p.brand} onChangeText={t => updateProduct(p.id, "brand", t)} placeholder="Бренд" />
                    <TextInput style={[styles.editInput, isDark && styles.inputDark]} value={p.name} onChangeText={t => updateProduct(p.id, "name", t)} placeholder="Название" />
                    <TextInput style={[styles.editInput, isDark && styles.inputDark]} value={String(p.price)} onChangeText={t => updateProduct(p.id, "price", t)} placeholder="Цена" keyboardType="numeric" />
                    <TextInput style={[styles.editInput, isDark && styles.inputDark]} value={p.image} onChangeText={t => updateProduct(p.id, "image", t)} placeholder="URL картинки" />
                    <TextInput style={[styles.editInput, isDark && styles.inputDark]} value={p.description || ""} onChangeText={t => updateProduct(p.id, "description", t)} placeholder="Описание" multiline />
                    <TextInput style={[styles.editInput, isDark && styles.inputDark]} value={p.sizes ? p.sizes.join(', ') : ""} onChangeText={t => updateProduct(p.id, "sizes", t)} placeholder="Размеры (через запятую)" />
                    <TouchableOpacity style={styles.saveBtn} onPress={() => setEditingProduct(null)}>
                      <Text style={styles.buttonText}>Сохранить</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={[styles.productName, isDark && styles.textDark]}>{p.brand} {p.name}</Text>
                    <Text style={[styles.price, isDark && styles.textDark]}>{money(p.price)}</Text>
                    <View style={styles.editActions}>
                      <TouchableOpacity onPress={() => setEditingProduct(p.id)}><Text style={styles.editAction}>✎ Редактировать</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteProduct(p.id)}><Text style={styles.editAction}>🗑 Удалить</Text></TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            ))}

            <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Рассылка</Text>
            <TextInput
              style={[styles.broadcastInput, isDark && styles.inputDark]}
              placeholder="Текст сообщения"
              placeholderTextColor={isDark ? "#999" : "#888"}
              value={broadcastText}
              onChangeText={setBroadcastText}
              multiline
            />
            <TouchableOpacity style={styles.broadcastBtn} onPress={sendBroadcast}>
              <Text style={styles.buttonText}>📨 Отправить рассылку ({users.length} получателей)</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  const OrderModal = () => {
    const [fullName, setFullName] = useState("");
    const [address, setAddress] = useState("");
    const [phone, setPhone] = useState("");
    const [delivery, setDelivery] = useState("europost");
    const [useFreeDelivery, setUseFreeDelivery] = useState(false);
    const { theme } = useTheme(); const isDark = theme === "dark";
    useEffect(() => {
      if (!orderModalVisible) { setFullName(""); setAddress(""); setPhone(""); setDelivery("europost"); setUseFreeDelivery(false); }
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
        Alert.alert("Ошибка", "Заполните все поля");
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
          <ScrollView contentContainerStyle={styles.modalScrollView}>
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
              <TextInput style={[styles.modalInput, isDark && styles.inputDark]} placeholder="ФИО" placeholderTextColor={isDark ? "#999" : "#888"} value={fullName} onChangeText={setFullName} />
              <TextInput style={[styles.modalInput, isDark && styles.inputDark]} placeholder={delivery === "europost" ? "Адрес и номер отделения" : "Адрес доставки"} placeholderTextColor={isDark ? "#999" : "#888"} value={address} onChangeText={setAddress} />
              <TextInput style={[styles.modalInput, isDark && styles.inputDark]} placeholder="Телефон" placeholderTextColor={isDark ? "#999" : "#888"} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
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
                <Text style={[styles.totalLabel, isDark && styles.textDark]}>Итого к оплате:</Text>
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

  const Menu = () => {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const isActive = (target) => page === target;

    return (
      <View style={[styles.menu, isDark && styles.menuDark]}>
        <TouchableOpacity onPress={() => setPage("catalog")} style={styles.menuButton}>
          <Text style={[styles.menuIcon, isActive("catalog") && styles.menuIconActive]}>👟</Text>
          <Text style={[styles.menuText, isActive("catalog") && styles.menuTextActive]}>Каталог</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPage("favorites")} style={styles.menuButton}>
          <Text style={[styles.menuIcon, isActive("favorites") && styles.menuIconActive]}>♥</Text>
          <Text style={[styles.menuText, isActive("favorites") && styles.menuTextActive]}>Избранное</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPage("cart")} style={styles.menuButton}>
          <View style={{ position: 'relative' }}>
            <Text style={[styles.menuIcon, isActive("cart") && styles.menuIconActive]}>🛒</Text>
            {cart.length > 0 && (
              <View style={styles.menuBadge}>
                <Text style={styles.menuBadgeText}>{cart.length}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.menuText, isActive("cart") && styles.menuTextActive]}>Корзина</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPage("profile")} style={styles.menuButton}>
          <Text style={[styles.menuIcon, isActive("profile") && styles.menuIconActive]}>👤</Text>
          <Text style={[styles.menuText, isActive("profile") && styles.menuTextActive]}>Я</Text>
        </TouchableOpacity>
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
        <Toast message={toastMessage} visible={toastVisible} onHide={hideToast} />
      </View>
    </ThemeContext.Provider>
  );
}

// ==============================
// СТИЛИ
// ==============================
const styles = StyleSheet.create({
  root: {
    flex: 1,
    height: '100%',
    width: '100%',
    backgroundColor: '#F7F7F5',
  },
  contentContainer: {
    flex: 1,
    paddingBottom: 80,
  },
  page: {
    flex: 1,
    backgroundColor: "#F7F7F5",
    padding: 14,
  },
  pageDark: { backgroundColor: "#1a1a1a" },
  textDark: { color: "#fff" },
  inputDark: { backgroundColor: "#333", color: "#fff", borderColor: "#555" },
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
  userName: { fontSize: 18 },

  referralBox: { backgroundColor: "#fff", padding: 16, borderRadius: 24 },
  referralBoxDark: { backgroundColor: "#2a2a2a" },
  referralText: { marginBottom: 12, fontSize: 13 },
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
  sizeText: { fontSize: 13, color: "#555", marginTop: 2 },

  adminButton: { backgroundColor: "#111", padding: 10, borderRadius: 18, marginVertical: 8, alignSelf: "flex-start" },
  closeAdmin: { marginBottom: 16, alignSelf: "flex-end" },
  closeAdminText: { fontSize: 15, fontWeight: "600" },
  adminStatCard: {
    backgroundColor: "#111",
    padding: 20,
    borderRadius: 24,
    marginBottom: 20,
  },
  adminStatCardDark: {
    backgroundColor: "#2a2a2a",
  },
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
  trackingInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 4, flex: 1, marginRight: 6, fontSize: 13 },
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

  totalRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: 12, paddingVertical: 8, borderTopWidth: 1, borderColor: "#ddd" },
  totalLabel: { fontSize: 16, fontWeight: "600" },
  totalAmount: { fontSize: 18, fontWeight: "900" },

  cartBadge: { fontSize: 16, fontWeight: "600", color: "#000" },
  menuBadge: {
    position: 'absolute',
    top: -8,
    right: -10,
    backgroundColor: '#ff3b30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  menuBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  menu: {
    position: 'absolute',
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
  },
  menuIcon: {
    fontSize: 22,
    color: '#333',
  },
  menuIconActive: {
    color: '#111',
  },
  menuText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#333',
  },
  menuTextActive: {
    fontWeight: 'bold',
    color: '#111',
  },

  back: { fontSize: 16, marginBottom: 12, color: "#555" },
  shareBtn: { fontSize: 22, marginBottom: 12 },
  productHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  descriptionText: { fontSize: 13, color: "#555", marginVertical: 4 },
  loader: { textAlign: "center", padding: 8, color: "#777" },
  empty: { textAlign: "center", padding: 20, color: "#999" },

  toastContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 9999,
  },
  toast: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    maxWidth: '80%',
  },
  toastText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
});
