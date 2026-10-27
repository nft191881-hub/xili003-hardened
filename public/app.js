const TOKEN_KEY = 'novax_token';

function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(typeof payload === 'string' ? payload : payload.error || 'Request failed');
  }

  return payload;
}

function money(value) {
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderMarkets(markets) {
  const list = document.getElementById('marketList');
  if (!list) return;

  list.innerHTML = markets.map(m => `
    <div class="coin-card">
      <div class="coin-info">
        <div class="coin-badge ${m.id === 'btc' ? 'btc' : m.id === 'eth' ? 'eth' : m.id === 'sol' ? 'sol' : 'usdc'}">
          ${m.symbol[0]}
        </div>
        <div>
          <div class="coin-name">${m.symbol} / USDT</div>
          <div class="coin-meta">${m.name}</div>
        </div>
      </div>
      <div class="coin-price">
        <div class="p ${m.change >= 0 ? 'up' : 'down'}">${money(m.price)}</div>
        <div class="u ${m.change >= 0 ? 'up' : 'down'}">${m.change >= 0 ? '+' : ''}${m.change.toFixed(2)}%</div>
      </div>
    </div>
  `).join('');
}

function renderWallet(wallet) {
  const total = document.getElementById('walletTotal');
  if (total) total.textContent = money(wallet.totalUsd || 0);

  const info = document.getElementById('walletInfo');
  if (info) info.textContent = `本月收益 $${((wallet.totalUsd || 0) * 0.042).toFixed(2)}`;

  const available = document.getElementById('walletAvailable');
  if (available) available.textContent = `可用 ${(wallet.usdc || 0).toLocaleString()}`;

  const assets = document.getElementById('walletAssets');
  if (!assets) return;

  const items = [
    { name: 'BTC', value: wallet.btc || 0, color: 'btc', amount: (wallet.btc || 0) * 68421 },
    { name: 'ETH', value: wallet.eth || 0, color: 'eth', amount: (wallet.eth || 0) * 3842 },
    { name: 'SOL', value: wallet.sol || 0, color: 'sol', amount: (wallet.sol || 0) * 148.24 },
    { name: 'USDC', value: wallet.usdc || 0, color: 'usdc', amount: wallet.usdc || 0 }
  ];

  assets.innerHTML = items.map(item => `
    <div class="asset-item">
      <div class="asset-head">
        <div class="coin-info">
          <div class="coin-badge ${item.color}">${item.name[0]}</div>
          <div>
            <div class="coin-name">${item.name}</div>
            <div class="asset-meta">${item.value}</div>
          </div>
        </div>
      </div>
      <div>
        <div class="asset-amount">${money(item.amount)}</div>
        <div class="asset-meta ${item.amount > 0 ? 'up' : 'down'}">${item.amount > 0 ? '+1.1%' : '-0.9%'}</div>
      </div>
    </div>
  `).join('');
}

function renderOrders(orders) {
  const walletOrders = document.getElementById('walletOrders');
  if (!walletOrders) return;

  if (!orders || !orders.length) {
    walletOrders.innerHTML = '<div class=\"order-item\"><div class=\"order-head\"><strong>暂无订单</strong></div></div>';
    return;
  }

  walletOrders.innerHTML = orders.map(order => `
    <div class="order-item">
      <div class="order-head">
        <strong>${order.pair}</strong>
        <span class="state-pill ${order.status === 'open' ? 'warn' : 'ok'}">${order.status === 'open' ? '待确认' : '已完成'}</span>
      </div>
      <div class="order-meta">${new Date(order.createdAt).toLocaleString()}</div>
      <div class="order-total">${order.side === 'buy' ? '+' : '-'} ${money(order.amount * order.price)}</div>
    </div>
  `).join('');
}

function renderTradeDepth(markets) {
  const tradeDepth = document.getElementById('tradeDepth');
  if (!tradeDepth) return;

  const depth = [
    { label: '卖单', value: '7.06 / 12.8k', color: 'down', badge: 'btc' },
    { label: '买单', value: '6.98 / 18.4k', color: 'up', badge: 'eth' },
    { label: '卖单', value: '148.2 / 8.4k', color: 'down', badge: 'sol' }
  ];

  tradeDepth.innerHTML = depth.map(item => `
    <div class="coin-card">
      <div class="coin-info">
        <div class="coin-badge ${item.badge}">${item.badge.toUpperCase()[0]}</div>
        <div>
          <div class="coin-name">${item.label}</div>
          <div class="coin-meta">${item.value}</div>
        </div>
      </div>
      <div class="coin-price">
        <div class="p ${item.color}">${item.color === 'up' ? '+0.21%' : '-0.12%'}</div>
      </div>
    </div>
  `).join('');
}

function renderChat(messages) {
  const chatList = document.getElementById('chatList');
  if (!chatList) return;

  if (!messages || !messages.length) {
    chatList.innerHTML = '<div class=\"chat-msg\"><div class=\"chat-text\">暂无消息</div></div>';
    return;
  }

  chatList.innerHTML = messages.map(msg => `
    <div class="chat-msg">
      <div class="chat-head">
        <span class="chat-user">${msg.username}</span>
        <span class="chat-time">${new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div class="chat-text">${msg.body}</div>
    </div>
  `).join('');
}

function setupTypeButtons() {
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

function bindEstimate() {
  const amountInput = document.getElementById('amountInput');
  const priceInput = document.getElementById('priceInput');
  const estimate = document.getElementById('estimateValue');

  if (amountInput && priceInput && estimate) {
    const update = () => {
      const amount = Number(amountInput.value || 0);
      const price = Number(priceInput.value || 0);
      estimate.textContent = `USDT ${Number(amount * price).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    };

    amountInput.addEventListener('input', update);
    priceInput.addEventListener('input', update);
  }

  const amountInput2 = document.getElementById('amountInputTrade');
  const priceInput2 = document.getElementById('priceInputTrade');
  const estimate2 = document.getElementById('estimateValueTrade');

  if (amountInput2 && priceInput2 && estimate2) {
    const update2 = () => {
      const amount = Number(amountInput2.value || 0);
      const price = Number(priceInput2.value || 0);
      estimate2.textContent = `USDT ${Number(amount * price).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    };

    amountInput2.addEventListener('input', update2);
    priceInput2.addEventListener('input', update2);
  }
}

async function loadHomeData() {
  try {
    const markets = await api('/api/markets');
    renderMarkets(markets);

    const wallet = await api('/api/wallet');
    const total = wallet.totalUsd || 42680;
    document.getElementById('homeTotal').textContent = money(total);
    document.getElementById('homeSubLeft').textContent = `≈ ${(wallet.btc || 0).toFixed(4)} BTC`;
    document.getElementById('homeSubRight').textContent = `USDT ${(wallet.usdc || 0).toLocaleString()}`;
  } catch (err) {
    console.error(err);
  }
}

async function loadWalletData() {
  try {
    const wallet = await api('/api/wallet');
    renderWallet(wallet);

    const orders = await api('/api/orders');
    renderOrders(orders);
  } catch (err) {
    console.error(err);
  }
}

async function loadTradeData() {
  try {
    const markets = await api('/api/markets');
    renderTradeDepth(markets);
  } catch (err) {
    console.error(err);
  }
}

async function loadChatData() {
  try {
    const messages = await api('/api/chat');
    renderChat(messages);
  } catch (err) {
    console.error(err);
  }
}

async function handleLoginSignup(type) {
  const username = document.getElementById(type === 'register' ? 'registerUsername' : 'loginUsername')?.value;
  const password = document.getElementById(type === 'register' ? 'registerPassword' : 'loginPassword')?.value;

  if (!username || !password) return;

  try {
    const result = await api(`/api/${type === 'register' ? 'register' : 'login'}`, {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    setToken(result.token);
    window.location.href = '/';
  } catch (err) {
    alert(err.message);
  }
}

function setupAuth() {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLoginSignup('login');
    });
  }

  const registerForm = document.getElementById('registerForm');
  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLoginSignup('register');
    });
  }

  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      clearToken();
      window.location.href = '/';
    });
  }
}

function setupTradeSubmission() {
  const tradeForm = document.getElementById('tradeForm');
  if (tradeForm) {
    tradeForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const token = getToken();
      if (!token) {
        alert('Please login first');
        return;
      }

      const payload = {
        pair: document.getElementById('pairSelect').value,
        side: document.querySelector('.type-btn.active').textContent.trim().toLowerCase(),
        amount: Number(document.getElementById('amountInput').value),
        price: Number(document.getElementById('priceInput').value)
      };

      try {
        await api('/api/orders', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        alert('Order placed successfully');
        window.location.href = './wallet.html';
      } catch (err) {
        alert(err.message);
      }
    });
  }

  const tradeFormPage = document.getElementById('tradeFormPage');
  if (tradeFormPage) {
    tradeFormPage.addEventListener('submit', async (e) => {
      e.preventDefault();

      const token = getToken();
      if (!token) {
        alert('Please login first');
        return;
      }

      const payload = {
        pair: document.getElementById('pairSelectTrade').value,
        side: document.querySelector('.type-btn.active').textContent.trim().toLowerCase(),
        amount: Number(document.getElementById('amountInputTrade').value),
        price: Number(document.getElementById('priceInputTrade').value)
      };

      try {
        await api('/api/orders', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        alert('Order placed successfully');
        window.location.href = './wallet.html';
      } catch (err) {
        alert(err.message);
      }
    });
  }
}

function setupChatSending() {
  const sendBtn = document.getElementById('sendChatButton');
  if (!sendBtn) return;

  sendBtn.addEventListener('click', async () => {
    const token = getToken();
    if (!token) {
      alert('Please login first');
      return;
    }

    const input = document.getElementById('chatInput');
    const text = input.value.trim();

    if (!text) return;

    try {
      await api('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text })
      });

      input.value = '';
      await loadChatData();
    } catch (err) {
      alert(err.message);
    }
  });
}

async function init() {
  setupAuth();
  setupTypeButtons();
  bindEstimate();
  setupTradeSubmission();
  setupChatSending();

  const page = document.body.dataset.page;

  if (page === 'home') {
    await loadHomeData();
  } else if (page === 'wallet') {
    await loadWalletData();
  } else if (page === 'trade') {
    await loadTradeData();
  } else if (page === 'chat') {
    await loadChatData();
  }
}

init();
