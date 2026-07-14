import React, { useState, useEffect, createContext, useContext } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Alert,
  TextInput, Clipboard, FlatList, Modal, Share, Switch
} from "react-native";
import AsyncStorage from "./AsyncStorage";

const ThemeContext = createContext();
const useTheme = () => useContext(ThemeContext);

// ==============================
// Telegram User
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

// ==============================
// ADMIN ID (замените на свои)
// ==============================
const ADMIN_IDS = [778715828, 987654321];

// ==============================
// DEFAULT PRODUCTS
// ==============================
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

export default function App() {
  const user = getTelegramUser();
  const [theme, setTheme] = useState("light");
  const toggleTheme = () => setTheme(t => t === "light" ? "dark" : "light");
  const isAdmin = ADMIN_IDS.includes(user.id);

  // Основные состояния
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

  // Модалка выбора размера в каталоге
  const [sizeModalVisible, setSizeModalVisible] = useState(false);
  const [sizeModalProduct, setSizeModalProduct] = useState(null);
  const [tempSelectedSize, setTempSelectedSize] = useState(null);

  const STORAGE_KEYS = {
    cart: "@krost_cart", favorites: "@krost_favorites", orders: "@krost_orders",
    bonus: "@krost_bonus", orderHistory: "@krost_orderHistory", products: "@krost_products",
    theme: "@krost_theme", adminOrders: "@krost_adminOrders",
    lastOrderNumber: "@krost_lastOrderNumber", users: "@krost_users",
    promoCodes: "@krost_promoCodes", usedFreeDelivery: "@krost_usedFreeDelivery"
  };

  // Загрузка
  useEffect(() => {
    const load = async () => {
      try {
        const [c, f, o, b, h, p, t, a, ln, u, pc, ufd] = await AsyncStorage.multiGet([
          STORAGE_KEYS.cart, STORAGE_KEYS.favorites, STORAGE_KEYS.orders, STORAGE_KEYS.bonus,
          STORAGE_KEYS.orderHistory, STORAGE_KEYS.products, STORAGE_KEYS.theme, STORAGE_KEYS.adminOrders,
          STORAGE_KEYS.lastOrderNumber, STORAGE_KEYS.users, STORAGE_KEYS.promoCodes, STORAGE_KEYS.usedFreeDelivery
        ]);
        if (c[1]) setCart(JSON.parse(c[1]));
        if (f[1]) setFavorites(JSON.parse(f[1]));
        if (o[1]) setOrders(JSON.parse(o[1]));
        if (b[1]) setBonusBalance(JSON.parse(b[1]));
        if (h[1]) setOrderHistory(JSON.parse(h[1]));
        if (p[1]) setProducts(JSON.parse(p[1]));
        if (t[1]) setTheme(JSON.parse(t[1]));
        if (a[1]) setAdminOrders(JSON.parse(a[1]));
        if (ln[1]) setLastOrderNumber(JSON.parse(ln[1]));
        else { setLastOrderNumber(3340); await AsyncStorage.setItem(STORAGE_KEYS.lastOrderNumber, JSON.stringify(3340)); }
        if (u[1]) setUsers(JSON.parse(u[1]));
        else { setUsers([user]); await AsyncStorage.setItem(STORAGE_KEYS.users, JSON.stringify([user])); }
        if (pc[1]) setPromoCodes(JSON.parse(pc[1]));
        else { setPromoCodes([]); await AsyncStorage.setItem(STORAGE_KEYS.promoCodes, JSON.stringify([])); }
        if (ufd[1]) setUsedFreeDelivery(JSON.parse(ufd[1]));
        else { setUsedFreeDelivery([]); await AsyncStorage.setItem(STORAGE_KEYS.usedFreeDelivery, JSON.stringify([])); }
      } catch (e) {}
    };
    load();
  }, []);

  // Сохранение
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(cart)); }, [cart]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(orders)); }, [orders]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.bonus, JSON.stringify(bonusBalance)); }, [bonusBalance]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.orderHistory, JSON.stringify(orderHistory)); }, [orderHistory]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.products, JSON.stringify(products)); }, [products]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.theme, JSON.stringify(theme)); }, [theme]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.adminOrders, JSON.stringify(adminOrders)); }, [adminOrders]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.lastOrderNumber, JSON.stringify(lastOrderNumber)); }, [lastOrderNumber]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.users, JSON.stringify(users)); }, [users]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.promoCodes, JSON.stringify(promoCodes)); }, [promoCodes]);
  useEffect(() => { AsyncStorage.setItem(STORAGE_KEYS.usedFreeDelivery, JSON.stringify(usedFreeDelivery)); }, [usedFreeDelivery]);

  // Обновление пользователей
  useEffect(() => {
    if (user.id !== "guest" && !users.some(u => u.id === user.id)) {
      setUsers(prev => [...prev, user]);
    }
  }, [user]);

  // Уровни
  const currentLevel = LEVELS.find(l => orders >= l.min && orders <= l.max) || LEVELS[0];
  const nextLevel = LEVELS[LEVELS.indexOf(currentLevel) + 1];
  let progress = 100;
  if (nextLevel) progress = Math.min(100, Math.floor(((orders - currentLevel.min) / (nextLevel.min - currentLevel.min)) * 100));
  const referral = `https://t.me/krost_shop_bot?start=${user.id}`;

  // Корзина
  const addCart = (item) => setCart([...cart, item]);
  const removeCart = (idx) => setCart(cart.filter((_, i) => i !== idx));

  // Избранное
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

  // Бесплатная доставка
  const isFreeDeliveryEligible = (phone, fullName) => {
    const key = phone.trim() + fullName.trim();
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

  // Отзывы
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

  // Фильтрация
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

  // Админка
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

  // Промокоды в админке
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
  // КОМПОНЕНТЫ
  // ==============================

  // Модалка выбора размера (всегда рендерится, visible управляет отображением)
  const SizeModal = () => {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const sizes = sizeModalProduct?.sizes || [];
    const handleAddWithSize = () => {
      if (!tempSelectedSize) {
        Alert.alert("Ошибка", "Выберите размер");
        return;
      }
      addCart({ ...sizeModalProduct, size: tempSelectedSize });
      setSizeModalVisible(false);
      setSizeModalProduct(null);
      setTempSelectedSize(null);
      Alert.alert("Добавлено", `Товар добавлен в корзину (размер ${tempSelectedSize})`);
    };
    return (
      <Modal transparent visible={sizeModalVisible} animationType="fade" onRequestClose={() => setSizeModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalView, isDark && styles.modalViewDark]}>
            <Text style={[styles.modalTitle, isDark && styles.textDark]}>Выберите размер</Text>
            <Text style={[styles.modalSubtitle, isDark && styles.textDark]}>{sizeModalProduct?.brand} {sizeModalProduct?.name}</Text>
            <View style={styles.sizeGrid}>
              {sizes.map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.sizeOption, tempSelectedSize === s && styles.sizeOptionActive]}
                  onPress={() => setTempSelectedSize(s)}
                >
                  <Text style={[styles.sizeOptionText, tempSelectedSize === s && styles.sizeOptionTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setSizeModalVisible(false)}>
                <Text>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={handleAddWithSize}>
                <Text style={styles.buttonText}>Добавить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };

  // ProductCard – размер обязателен
  const ProductCard = ({ item }) => {
    const isFav = favorites.some(x => x.id === item.id);
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const handleAddToCart = () => {
      // Отладочный алерт – убедимся, что функция вызывается
      Alert.alert("Добавление", `Вы нажали "В корзину" для ${item.name}`);
      if (item.sizes && item.sizes.length > 0) {
        setSizeModalProduct(item);
        setTempSelectedSize(null);
        setSizeModalVisible(true);
      } else {
        Alert.alert("Ошибка", "У этого товара нет доступных размеров");
      }
    };
    return (
      <View style={[styles.card, isDark && styles.cardDark]}>
        <TouchableOpacity onPress={() => { setSelectedProduct(item); setSelectedSize(null); setPage("product"); }}>
          <Image source={{ uri: item.image }} style={styles.image} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.favorite} onPress={() => toggleFavorite(item)}>
          <Text style={styles.favoriteText}>{isFav ? "♥" : "♡"}</Text>
        </TouchableOpacity>
        <Text style={[styles.brand, isDark && styles.textDark]}>{item.brand}</Text>
        <Text style={[styles.productName, isDark && styles.textDark]}>{item.name}</Text>
        {item.oldPrice && <Text style={styles.oldPrice}>{money(item.oldPrice)}</Text>}
        <Text style={[styles.price, isDark && styles.textDark]}>{money(item.price)}</Text>
        <TouchableOpacity style={styles.smallButton} onPress={handleAddToCart}>
          <Text style={styles.buttonText}>В корзину</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Home
  const Home = () => {
    const popularItems = [...products].sort((a,b) => b.sales - a.sales).slice(0,4);
    const recommended = getRecommended();
    const { theme } = useTheme(); const isDark = theme === "dark";
    return (
      <ScrollView style={[styles.page, isDark && styles.pageDark]}>
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
      </ScrollView>
    );
  };

  // Catalog
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
          contentContainerStyle={{ paddingBottom: 90 }}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={loadingMore ? <Text style={[styles.loader, isDark && styles.textDark]}>Загрузка...</Text> : null}
          ListEmptyComponent={<Text style={[styles.empty, isDark && styles.textDark]}>Товаров нет</Text>}
        />
      </View>
    );
  };

  // ProductPage
  const ProductPage = () => {
    if (!selectedProduct) return null;
    const { theme } = useTheme(); const isDark = theme === "dark";
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState("");
    const hasPurchased = orderHistory.some(order => order.items.some(i => i.id === selectedProduct.id));
    const handleAddToCart = () => {
      if (!selectedSize) {
        Alert.alert("Выберите размер");
        return;
      }
      addCart({ ...selectedProduct, size: selectedSize });
      Alert.alert("Добавлено", "Товар в корзине");
    };
    const submitRating = () => {
      if (rating === 0) { Alert.alert("Ошибка", "Поставьте оценку"); return; }
      addRating(selectedProduct.id, rating, comment);
      setRating(0); setComment("");
      Alert.alert("Спасибо", "Отзыв добавлен");
    };
    return (
      <ScrollView style={[styles.page, isDark && styles.pageDark]}>
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
            {(selectedProduct.sizes || ["40","41","42","43","44"]).map(s => (
              <TouchableOpacity key={s} style={[styles.size, selectedSize === s && styles.sizeActive]} onPress={() => setSelectedSize(s)}>
                <Text style={selectedSize === s && styles.sizeTextActive}>{s}</Text>
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
      </ScrollView>
    );
  };

  // Favorites
  const Favorites = () => {
    const { theme } = useTheme(); const isDark = theme === "dark";
    return (
      <ScrollView style={[styles.page, isDark && styles.pageDark]}>
        <Text style={[styles.pageTitle, isDark && styles.textDark]}>Избранное</Text>
        {favorites.length === 0 ? (
          <Text style={[styles.empty, isDark && styles.textDark]}>Нет сохраненных товаров</Text>
        ) : (
          <View style={styles.grid}>
            {favorites.map(item => <ProductCard key={item.id} item={item} />)}
          </View>
        )}
      </ScrollView>
    );
  };

  // Cart – с локальным состоянием для промокода
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
      <ScrollView style={[styles.page, isDark && styles.pageDark]} keyboardShouldPersistTaps="handled">
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
      </ScrollView>
    );
  };

  // Profile
  const Profile = () => {
    const { theme, toggleTheme } = useTheme(); const isDark = theme === "dark";
    return (
      <ScrollView style={[styles.page, isDark && styles.pageDark]}>
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
      </ScrollView>
    );
  };

  // AdminPanel
  const AdminPanel = () => {
    const { theme } = useTheme(); const isDark = theme === "dark";
    if (!showAdmin || !isAdmin) return null;
    return (
      <Modal visible={showAdmin} animationType="slide" transparent={false}>
        <View style={[styles.page, isDark && styles.pageDark, {paddingTop: 40}]}>
          <TouchableOpacity onPress={() => setShowAdmin(false)} style={styles.closeAdmin}>
            <Text style={[styles.closeAdminText, isDark && styles.textDark]}>✕ Закрыть админку</Text>
          </TouchableOpacity>
          <Text style={[styles.pageTitle, isDark && styles.textDark]}>Админ-панель</Text>
          <Text style={[styles.adminStat, isDark && styles.textDark]}>Выручка: {money(adminRevenue)}</Text>
          <Text style={[styles.adminStat, isDark && styles.textDark]}>Заказов: {adminOrders.length}</Text>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Популярные товары</Text>
          {popular.length > 0 ? popular.map(p => (
            <Text key={p.id} style={[styles.adminItem, isDark && styles.textDark]}>{p.brand} {p.name} — продано {salesMap[p.id] || 0} шт.</Text>
          )) : <Text style={[styles.empty, isDark && styles.textDark]}>Нет данных</Text>}

          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>Управление заказами</Text>
          {adminOrders.map(order => (
            <View key={order.id} style={[styles.orderCard, isDark && styles.orderCardDark]}>
              <Text style={[styles.orderId, isDark && styles.textDark]}>#{order.id} — {order.fullName}</Text>
              <Text style={[styles.orderStatus, isDark && styles.textDark]}>Статус: {order.status}</Text>
              {order.delivery === "europost" && (
                <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 5}}>
                  <TextInput
                    style={[styles.trackingInput, isDark && styles.inputDark]}
                    placeholder="Трек-номер"
                    placeholderTextColor={isDark ? "#999" : "#888"}
                    value={order.trackingNumber || ""}
                    onChangeText={text => updateTracking(order.id, text)}
                  />
                </View>
              )}
              <View style={styles.statusButtons}>
                {ORDER_STATUSES.map(s => (
                  <TouchableOpacity key={s} style={[styles.statusBtn, order.status === s && styles.statusBtnActive]} onPress={() => changeStatus(order.id, s)}>
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
                  <Text style={[styles.editAction, {color: 'red'}]}>🗑</Text>
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
                    <TouchableOpacity onPress={() => setEditingProduct(p.id)}><Text style={styles.editAction}>✎</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteProduct(p.id)}><Text style={styles.editAction}>🗑</Text></TouchableOpacity>
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
        </View>
      </Modal>
    );
  };

  // OrderModal
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

  // Menu
  const Menu = () => {
    const { theme } = useTheme(); const isDark = theme === "dark";
    return (
      <View style={[styles.menu, isDark && styles.menuDark]}>
        <TouchableOpacity onPress={() => setPage("home")}><Text>🏠</Text><Text style={[isDark && styles.textDark]}>Главная</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setPage("catalog")}><Text>👟</Text><Text style={[isDark && styles.textDark]}>Каталог</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setPage("favorites")}><Text>♡</Text><Text style={[isDark && styles.textDark]}>Избранное</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setPage("cart")}>
          <View style={{position: 'relative'}}>
            <Text>🛒</Text>
            {cart.length > 0 && <View style={styles.menuBadge}><Text style={styles.menuBadgeText}>{cart.length}</Text></View>}
          </View>
          <Text style={[isDark && styles.textDark]}>Корзина</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPage("profile")}><Text>👤</Text><Text style={[isDark && styles.textDark]}>Я</Text></TouchableOpacity>
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
      <View style={{ flex: 1, backgroundColor: theme === "dark" ? "#1a1a1a" : "#F7F7F5" }}>
        {content}
        <Menu />
        <OrderModal />
        <AdminPanel />
        <SizeModal />
      </View>
    </ThemeContext.Provider>
  );
}

// ==============================
// СТИЛИ (полный набор)
// ==============================
const styles = StyleSheet.create({
  page: { flex: 1, padding: 18, paddingBottom: 90 },
  pageDark: { backgroundColor: "#1a1a1a" },
  textDark: { color: "#fff" },
  inputDark: { backgroundColor: "#333", color: "#fff", borderColor: "#555" },
  cardDark: { backgroundColor: "#2a2a2a" },
  logo: { fontSize: 42, fontWeight: "900", marginTop: 25 },
  description: { color: "#777", marginTop: 5 },
  pageTitle: { fontSize: 32, fontWeight: "900", marginTop: 25, marginBottom: 15 },
  sectionTitle: { fontSize: 25, fontWeight: "900", marginTop: 25, marginBottom: 15 },
  banner: { backgroundColor: "#111", padding: 30, borderRadius: 35, marginTop: 25 },
  bannerTitle: { fontSize: 36, fontWeight: "900", color: "#fff" },
  bannerButton: { backgroundColor: "#fff", padding: 15, borderRadius: 25, marginTop: 20, alignSelf: "flex-start" },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  card: { width: "48%", backgroundColor: "#fff", borderRadius: 25, padding: 10, marginBottom: 15 },
  image: { height: 150, width: "100%", borderRadius: 20 },
  bigImage: { width: "100%", height: 350, borderRadius: 30 },
  favorite: { position: "absolute", right: 15, top: 15 },
  favoriteText: { fontSize: 24 },
  brand: { fontSize: 12, color: "#777", marginTop: 10 },
  productName: { fontSize: 16, fontWeight: "800", marginTop: 5 },
  price: { fontSize: 22, fontWeight: "900", marginTop: 5 },
  oldPrice: { textDecorationLine: "line-through", color: "#999" },
  smallButton: { backgroundColor: "#111", padding: 10, borderRadius: 18, marginTop: 10 },
  buttonText: { color: "#fff", textAlign: "center", fontWeight: "800" },
  bigTitle: { fontSize: 30, fontWeight: "900" },
  bigPrice: { fontSize: 35, fontWeight: "900" },
  oldPriceBig: { textDecorationLine: "line-through", color: "#999", fontSize: 20 },
  buyButton: { backgroundColor: "#111", padding: 18, borderRadius: 25, marginTop: 20 },
  cartItem: { backgroundColor: "#fff", padding: 15, borderRadius: 25, flexDirection: "row", marginBottom: 15 },
  cartItemDark: { backgroundColor: "#2a2a2a" },
  cartImage: { width: 90, height: 90, borderRadius: 20, marginRight: 15 },
  remove: { color: "red", marginTop: 10 },
  total: { fontSize: 28, fontWeight: "900" },
  balanceCard: { backgroundColor: "#111", padding: 30, borderRadius: 35 },
  balanceLabel: { color: "#fff" },
  balanceValue: { color: "#fff", fontSize: 45, fontWeight: "900" },
  balanceInfo: { color: "#fff" },
  userName: { fontSize: 20 },
  referralBox: { backgroundColor: "#fff", padding: 20, borderRadius: 30 },
  referralBoxDark: { backgroundColor: "#2a2a2a" },
  referralText: { marginBottom: 15 },
  copyButton: { backgroundColor: "#111", padding: 15, borderRadius: 20 },
  currentLevel: { backgroundColor: "#111", padding: 25, borderRadius: 30 },
  currentLevelTitle: { fontSize: 30, fontWeight: "900", color: "#fff" },
  currentInfo: { color: "#fff", marginTop: 8 },
  progressBackground: { height: 10, backgroundColor: "#555", borderRadius: 10, marginTop: 15 },
  progress: { height: 10, backgroundColor: "#fff", borderRadius: 10 },
  levelCard: { backgroundColor: "#fff", padding: 22, borderRadius: 30, marginBottom: 15 },
  levelCardDark: { backgroundColor: "#2a2a2a" },
  activeLevel: { backgroundColor: "#111" },
  levelName: { fontSize: 22, fontWeight: "900" },
  levelInfo: { marginTop: 5 },
  activeText: { color: "#fff" },
  menu: { height: 75, backgroundColor: "#fff", borderTopWidth: 1, borderColor: "#ddd", flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  menuDark: { backgroundColor: "#1a1a1a", borderColor: "#333" },
  back: { fontSize: 18, marginBottom: 15, color: "#555" },
  shareBtn: { fontSize: 24, marginBottom: 15 },
  productHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sizeBox: { marginTop: 20 },
  sizeTitle: { fontSize: 16, fontWeight: "600", marginBottom: 10 },
  sizes: { flexDirection: "row", flexWrap: "wrap" },
  size: { width: 50, height: 50, borderRadius: 25, backgroundColor: "#eee", justifyContent: "center", alignItems: "center", marginRight: 10, marginBottom: 10 },
  sizeActive: { backgroundColor: "#111" },
  sizeTextActive: { color: "#fff" },
  searchInput: { backgroundColor: "#fff", padding: 12, borderRadius: 25, marginBottom: 15, fontSize: 16 },
  filterScroll: { flexDirection: "row", marginBottom: 15, height: 50, flexShrink: 0, flexGrow: 0 },
  filterContent: { alignItems: "center" },
  filterChip: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: "#eee", marginRight: 10, alignSelf: "flex-start", flexShrink: 0, flexGrow: 0 },
  filterChipActive: { backgroundColor: "#111" },
  filterChipTextActive: { color: "#fff" },
  priceFilter: { flexDirection: "row", marginBottom: 15 },
  priceInput: { flex: 1, backgroundColor: "#fff", padding: 10, borderRadius: 20, marginRight: 10, fontSize: 16 },
  loader: { textAlign: "center", padding: 10, color: "#777" },
  empty: { textAlign: "center", padding: 30, color: "#999" },
  sizeText: { fontSize: 14, color: "#555", marginTop: 2 },
  bonusInfo: { fontSize: 16, color: "#2e7d32", marginTop: 5 },
  modalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" },
  modalScrollView: { flexGrow: 1, justifyContent: "center", paddingVertical: 20 },
  modalView: { width: "90%", backgroundColor: "#fff", borderRadius: 30, padding: 25, alignItems: "stretch", alignSelf: "center" },
  modalViewDark: { backgroundColor: "#2a2a2a" },
  modalTitle: { fontSize: 22, fontWeight: "900", marginBottom: 20, textAlign: "center" },
  modalSubtitle: { fontSize: 16, textAlign: "center", marginBottom: 15, color: "#666" },
  modalInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 15, padding: 12, marginBottom: 15, fontSize: 16 },
  bonusCheckbox: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  bonusCheckboxText: { fontSize: 16, fontWeight: "600" },
  modalButtons: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  modalCancel: { padding: 12, borderRadius: 20, backgroundColor: "#eee", flex: 0.4, alignItems: "center" },
  modalConfirm: { padding: 12, borderRadius: 20, backgroundColor: "#111", flex: 0.5, alignItems: "center" },
  deliveryLabel: { fontSize: 16, fontWeight: "600", marginBottom: 10 },
  deliveryOptions: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  deliveryOption: { flex: 1, padding: 12, borderRadius: 15, backgroundColor: "#eee", marginHorizontal: 5, alignItems: "center" },
  deliveryOptionActive: { backgroundColor: "#111" },
  deliveryOptionTextActive: { color: "#fff" },
  deliveryDetail: { fontSize: 12, color: "#666", marginTop: 4 },
  deliveryNote: { fontSize: 11, color: "#999", marginTop: 2 },
  deliverySummary: { backgroundColor: "#f0f0f0", padding: 10, borderRadius: 12, marginBottom: 15, flexDirection: "row", justifyContent: "space-between" },
  deliverySummaryDark: { backgroundColor: "#333" },
  summaryText: { fontSize: 14, fontWeight: "500" },
  promoBox: { flexDirection: "row", marginVertical: 10 },
  promoInput: { flex: 1, borderWidth: 1, borderColor: "#ddd", borderRadius: 20, padding: 10, marginRight: 10 },
  promoButton: { backgroundColor: "#111", padding: 10, borderRadius: 20, justifyContent: "center" },
  discountText: { fontSize: 18, color: "green", marginTop: 5 },
  finalTotal: { fontSize: 24, fontWeight: "900", marginTop: 5 },
  orderCard: { backgroundColor: "#fff", padding: 15, borderRadius: 20, marginBottom: 15 },
  orderCardDark: { backgroundColor: "#2a2a2a" },
  orderId: { fontSize: 16, fontWeight: "800" },
  orderDate: { color: "#777", marginTop: 3 },
  orderStatus: { fontWeight: "600", marginTop: 5 },
  orderTotal: { fontWeight: "700", marginTop: 5 },
  orderItem: { fontSize: 14, marginLeft: 10 },
  orderMore: { fontSize: 12, color: "#777", marginLeft: 10 },
  themeRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 15 },
  themeLabel: { fontSize: 18 },
  closeAdmin: { marginBottom: 20, alignSelf: "flex-end" },
  closeAdminText: { fontSize: 16, fontWeight: "600" },
  adminStat: { fontSize: 18, marginVertical: 5 },
  adminItem: { fontSize: 14, marginVertical: 3 },
  statusButtons: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
  statusBtn: { padding: 6, borderRadius: 15, backgroundColor: "#eee", marginRight: 8, marginBottom: 5 },
  statusBtnActive: { backgroundColor: "#111" },
  statusBtnText: { fontSize: 12 },
  statusBtnTextActive: { color: "#fff" },
  addBtn: { backgroundColor: "#111", padding: 15, borderRadius: 25, alignItems: "center", marginVertical: 15 },
  productEdit: { backgroundColor: "#fff", padding: 15, borderRadius: 20, marginBottom: 10 },
  productEditDark: { backgroundColor: "#2a2a2a" },
  editInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 8, marginBottom: 8, fontSize: 14 },
  saveBtn: { backgroundColor: "#111", padding: 10, borderRadius: 20, alignItems: "center" },
  editActions: { flexDirection: "row", marginTop: 5 },
  editAction: { fontSize: 20, marginRight: 15 },
  ratingDisplay: { fontSize: 16, marginVertical: 5 },
  reviewItem: { backgroundColor: "#f0f0f0", padding: 10, borderRadius: 15, marginBottom: 10 },
  reviewItemDark: { backgroundColor: "#333" },
  reviewRating: { fontSize: 16 },
  reviewComment: { fontSize: 14, marginTop: 3 },
  reviewDate: { fontSize: 12, color: "#777", marginTop: 3 },
  noReviews: { fontStyle: "italic", marginVertical: 10 },
  reviewForm: { marginTop: 20, padding: 15, backgroundColor: "#f9f9f9", borderRadius: 20 },
  reviewFormDark: { backgroundColor: "#2a2a2a" },
  reviewFormTitle: { fontSize: 18, fontWeight: "600", marginBottom: 10 },
  stars: { flexDirection: "row", marginBottom: 10 },
  star: { fontSize: 30, marginRight: 5 },
  starActive: { color: "#f5c518" },
  reviewInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 15, padding: 10, marginBottom: 10 },
  submitReview: { backgroundColor: "#111", padding: 12, borderRadius: 20, alignItems: "center" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", marginVertical: 15, paddingVertical: 10, borderTopWidth: 1, borderColor: "#ddd" },
  totalLabel: { fontSize: 18, fontWeight: "600" },
  totalAmount: { fontSize: 22, fontWeight: "900" },
  cartBadge: { fontSize: 18, fontWeight: "600", color: "#000" },
  menuBadge: { position: 'absolute', top: -8, right: -12, backgroundColor: '#ff3b30', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  menuBadgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  adminButton: { backgroundColor: "#111", padding: 12, borderRadius: 20, marginVertical: 10, alignSelf: "flex-start" },
  descriptionText: { fontSize: 14, color: "#555", marginVertical: 5 },
  trackingText: { fontSize: 14, color: "#0066cc", marginTop: 3 },
  trackingInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 6, flex: 1, marginRight: 8, fontSize: 14 },
  broadcastInput: { borderWidth: 1, borderColor: "#ddd", borderRadius: 15, padding: 12, marginBottom: 15, minHeight: 80, fontSize: 16 },
  broadcastBtn: { backgroundColor: "#111", padding: 15, borderRadius: 25, alignItems: "center", marginBottom: 30 },
  sizeGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginVertical: 15 },
  sizeOption: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#eee", justifyContent: "center", alignItems: "center", margin: 8 },
  sizeOptionActive: { backgroundColor: "#111" },
  sizeOptionText: { fontSize: 18, fontWeight: "600" },
  sizeOptionTextActive: { color: "#fff" },
});