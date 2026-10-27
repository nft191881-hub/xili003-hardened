* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #0f172a;
  color: #e5e7eb;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

.app-shell {
  max-width: 1500px;
  margin: 0 auto;
  padding: 20px;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid #334155;
  border-radius: 14px;
  padding: 18px 22px;
  position: sticky;
  top: 0;
  z-index: 20;
  backdrop-filter: blur(10px);
}

.brand {
  font-size: 1.6rem;
  font-weight: 700;
  color: #f8fafc;
}

.nav {
  display: flex;
  gap: 16px;
}

.nav a {
  color: #cbd5e1;
  text-decoration: none;
}

.user-box {
  min-width: 120px;
  text-align: right;
  color: #bfdbfe;
}

.main-layout {
  margin-top: 24px;
  display: grid;
  grid-template-columns: 280px 1fr 320px;
  gap: 20px;
}

.panel {
  background: rgba(15, 23, 42, 0.9);
  border: 1px solid #334155;
  border-radius: 16px;
  padding: 18px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.25);
}

h3 {
  margin: 0 0 20px;
  font-size: 1.2rem;
}

.tab-switch {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.tab {
  flex: 1;
  background: #1e293b;
  color: #cbd5e1;
  border: 1px solid #475569;
  border-radius: 10px;
  padding: 10px;
}

.tab.active {
  background: #2563eb;
  border-color: #2563eb;
  color: white;
}

.auth-form,
.chat-form,
#productForm {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.auth-form {
  display: none;
}

.auth-form.active {
  display: flex;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid #475569;
  background: #0f172a;
  color: #f8fafc;
  border-radius: 10px;
  padding: 10px 12px;
}

textarea {
  resize: vertical;
}

button {
  background: #2563eb;
  border: none;
  border-radius: 10px;
  color: white;
  padding: 11px 14px;
  font-weight: 600;
  transition: 0.2s;
}

button:hover {
  filter: brightness(1.08);
}

button.danger {
  background: #dc2626;
}

.hidden {
  display: none !important;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.filters {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.product-list,
.order-list,
.chat-list {
  display: grid;
  gap: 14px;
}

.product-card,
.order-card,
.chat-item {
  background: #111827;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 14px;
}

.product-card h4,
.order-card h4 {
  margin: 0 0 8px;
}

.product-meta,
.order-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: #cbd5e1;
  font-size: 0.9rem;
  margin-bottom: 10px;
}

.product-price {
  font-size: 1.4rem;
  font-weight: 700;
  color: #fbbf24;
}

.product-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.order-list,
.chat-list {
  max-height: 300px;
  overflow: auto;
}

.chat-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chat-item small {
  color: #94a3b8;
}

@media (max-width: 1100px) {
  .main-layout {
    grid-template-columns: 1fr;
  }

  .topbar {
    flex-wrap: wrap;
  }
}
