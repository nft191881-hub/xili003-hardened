const state = {
  token: localStorage.getItem('token') || '',
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  categories: [],
  products: [],
  orders: [],
  messages: [],
};

const els = {
  loginForm: document.getElementById('loginForm'),
  registerForm: document.getElementById('registerForm'),
  loginUsername: document.getElementById('loginUsername'),
  loginPassword: document.getElementById('loginPassword'),
  registerUsername: document.getElementById('registerUsername'),
  registerPassword: document.getElementById('registerPassword'),
  logoutBtn: document.getElementById('logoutBtn'),
  userInfo: document.getElementById('userInfo'),
  productCategory: document.getElementById('productCategory'),
  productForm: document.getElementById('productForm'),
  productTitle: document.getElementById('productTitle'),
  productDescription: document.getElementById('productDescription'),
  productPrice: document.getElementById('productPrice'),
  productStock: document.getElementById('productStock'),
  productImages: document.getElementById('productImages'),
  categoryFilter: document.getElementById('categoryFilter'),
  productList: document.getElementById('productList'),
  orderList: document.getElementById('orderList'),
  searchInput: document.getElementById('searchInput'),
  chatForm: document.getElementById('chatForm'),
  chatInput: document.getElementById('chatInput'),
  chatList: document.getElementById('chatList'),
};

document.querySelectorAll('.tab').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b === button));
    const isLogin = button.dataset.tab === 'login';
    els.loginForm.classList.toggle('active', isLogin);
    els.registerForm.classList.toggle('active', !isLogin);
  });
});

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(typeof payload === 'string' ? payload : payload.error || '请求失败');
  }

  return payload;
}

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
  renderUserState();
}

function clearSession() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  renderUserState();
}

function renderUserState() {
  if (state.user) {
    els.userInfo.textContent = `${state.user.username} (${state.user.role})`;
    els.logoutBtn.classList.remove('hidden');
  } else {
    els.userInfo.textContent = '未登录';
    els.logoutBtn.classList.add('hidden');
  }
}

async function loadCategories() {
  const categories = await api('/api/categories');
  state.categories = categories;

  const options = categories.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
  els.productCategory.innerHTML = `<option value="">请选择分类</option>${options}`;
  els.categoryFilter.innerHTML = `<option value="">全部分类</option>${options}`;
}

function renderProducts() {
  const keyword = document.getElementById('searchInput').value.trim().toLowerCase();
  const categoryId = document.getElementById('categoryFilter').value;

  const filtered = state.products.filter((p) => {
    const matchKeyword = !keyword || (p.title || '').toLowerCase().includes(keyword) || (p.description || '').toLowerCase().includes(keyword);
    const matchCategory = !categoryId || String(p.category_id || p.categoryId) === String(categoryId);
    return matchKeyword && matchCategory;
  });

  els.productList.innerHTML = filtered.map((product) => `
    <div class="product-card">
      <h4>${product.title}</h4>
      <div class="product-meta">
        <span>卖家：${product.seller_name || '未知'}</span>
        <span>库存：${product.stock}</span>
      </div>
      <div class="product-price">￥${Number(product.price).toFixed(2)}</div>
      <p>${product.description || '暂无描述'}</p>
      <div class="product-actions">
        <span>${product.sold || 0} 已售</span>
        <button class="buy-btn" data-id="${product.id}">购买</button>
      </div>
    </div>
  `).join('') || '<div class="product-card">暂无商品</div>';

  document.querySelectorAll('.buy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!state.token) {
        alert('请先登录');
        return;
      }
      const id = Number(btn.dataset.id);
      try {
        const result = await api('/api/orders', {
          method: 'POST',
          body: JSON.stringify({ product_id: id, qty: 1 }),
        });
        alert(`购买成功，订单号：${result.id}`);
        await loadOrders();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

async function loadProducts() {
  const products = await api('/api/products');
  state.products = products;
  renderProducts();
}

async function loadOrders() {
  if (!state.token) {
    els.orderList.innerHTML = '<div class="order-card">请先登录查看订单</div>';
    return;
  }

  const orders = await api('/api/orders');
  state.orders = orders;
  els.orderList.innerHTML = orders.map((order) => `
    <div class="order-card">
      <h4>${order.product_title || '商品订单'}</h4>
      <div class="order-meta">
        <span>金额：￥${Number(order.amount).toFixed(2)}</span>
        <span>状态：${order.status}</span>
      </div>
      <div class="order-meta">
        <span>数量：${order.qty}</span>
        <span>${new Date(order.created_at).toLocaleString()}</span>
      </div>
    </div>
  `).join('') || '<div class="order-card">暂无订单</div>';
}

async function loadMessages() {
  const messages = await api('/api/chat');
  state.messages = messages;
