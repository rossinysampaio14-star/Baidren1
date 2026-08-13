const express = require("express");
const path = require("path");
const crypto = require("crypto");

const app = express();

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));

const products = [
  {
    id: 1,
    nome: "Runner Core Black",
    marca: "BAIDREN",
    modelo: "Runner Core",
    sku: "BD-RUN-001",
    descricao: "Tênis BAIDREN Runner Core Black.",
    preco: 34900,
    preco_promocional: 29900,
    categoria: "Masculino",
    cor: "Preto",
    material: "Sintético",
    ativo: 1,
    images: ["/og-image.svg"],
    sizes: [
      { tamanho: "35", estoque: 2 },
      { tamanho: "36", estoque: 5 },
      { tamanho: "37", estoque: 8 },
      { tamanho: "38", estoque: 10 },
      { tamanho: "39", estoque: 7 },
      { tamanho: "40", estoque: 4 },
      { tamanho: "41", estoque: 3 },
      { tamanho: "42", estoque: 1 }
    ]
  },
  {
    id: 2,
    nome: "Street Pulse White",
    marca: "BAIDREN",
    modelo: "Street Pulse",
    sku: "BD-STP-002",
    descricao: "Tênis BAIDREN Street Pulse White.",
    preco: 39900,
    preco_promocional: null,
    categoria: "Feminino",
    cor: "Branco",
    material: "Têxtil",
    ativo: 1,
    images: ["/og-image.svg"],
    sizes: [
      { tamanho: "35", estoque: 3 },
      { tamanho: "36", estoque: 5 },
      { tamanho: "37", estoque: 7 },
      { tamanho: "38", estoque: 8 },
      { tamanho: "39", estoque: 4 },
      { tamanho: "40", estoque: 2 }
    ]
  },
  {
    id: 3,
    nome: "Urban Motion Grey",
    marca: "BAIDREN",
    modelo: "Urban Motion",
    sku: "BD-URB-003",
    descricao: "Tênis BAIDREN Urban Motion Grey.",
    preco: 42900,
    preco_promocional: 37900,
    categoria: "Lançamentos",
    cor: "Cinza",
    material: "Mesh",
    ativo: 1,
    images: ["/og-image.svg"],
    sizes: [
      { tamanho: "36", estoque: 3 },
      { tamanho: "37", estoque: 6 },
      { tamanho: "38", estoque: 8 },
      { tamanho: "39", estoque: 7 },
      { tamanho: "40", estoque: 5 },
      { tamanho: "41", estoque: 3 },
      { tamanho: "42", estoque: 1 }
    ]
  }
];

const orders = [];

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function publicProduct(p) {
  return {
    ...p,
    disponivel: p.sizes.reduce(
      (total, size) => total + Math.max(0, Number(size.estoque) || 0),
      0
    )
  };
}

function getProduct(id) {
  return products.find(
    (product) => product.id === Number(id) && product.ativo === 1
  );
}

function getCsrf(req, res) {
  let token = req.headers["x-csrf-token"];

  if (!token) {
    token = crypto.randomBytes(24).toString("hex");
  }

  return token;
}

/* API */

app.get("/api/csrf", (req, res) => {
  res.json({
    token: getCsrf(req, res)
  });
});

app.get("/api/products", (req, res) => {
  res.json(products.filter((p) => p.ativo === 1).map(publicProduct));
});

app.post("/api/orders", (req, res) => {
  try {
    const {
      items,
      address,
      email,
      name,
      phone,
      paymentMethod = "pix"
    } = req.body || {};

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({
        error: "Carrinho vazio."
      });
    }

    if (!name || String(name).trim().length < 3) {
      return res.status(400).json({
        error: "Nome inválido."
      });
    }

    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))
    ) {
      return res.status(400).json({
        error: "E-mail inválido."
      });
    }

    if (!address || !address.cep || !address.rua || !address.numero) {
      return res.status(400).json({
        error: "Endereço incompleto."
      });
    }

    let subtotal = 0;
    const normalized = [];

    for (const item of items) {
      const product = getProduct(item.productId);

      if (!product) {
        throw new Error("Produto não encontrado.");
      }

      const size = String(item.size || "");

      const sizeData = product.sizes.find(
        (s) => String(s.tamanho) === size
      );

      const quantity = Math.max(
        1,
        Math.min(10, Number(item.quantity) || 1)
      );

      if (!sizeData || sizeData.estoque < quantity) {
        throw new Error(
          `Tamanho ${size} sem estoque para ${product.nome}.`
        );
      }

      const price =
        product.preco_promocional ?? product.preco;

      subtotal += price * quantity;

      normalized.push({
        product,
        sizeData,
        size,
        quantity,
        price
      });
    }

    const frete = subtotal >= 50000 ? 0 : 1990;
    const total = subtotal + frete;

    for (const item of normalized) {
      item.sizeData.estoque -= item.quantity;
    }

    const order = {
      id: orders.length + 1,
      status: "Aguardando pagamento",
      payment_status: "pending",
      subtotal,
      desconto: 0,
      frete,
      total,
      paymentMethod,
      customer: {
        name: String(name),
        email: String(email),
        phone: String(phone || "")
      },
      address,
      items: normalized.map((item) => ({
        productId: item.product.id,
        nome: item.product.nome,
        tamanho: item.size,
        quantidade: item.quantity,
        preco: item.price
      })),
      created_at: new Date().toISOString()
    };

    orders.push(order);

    res.status(201).json({
      success: true,
      order: {
        id: order.id,
        total: order.total,
        paymentMethod: order.paymentMethod
      },
      message:
        "Pedido criado. A confirmação do pagamento depende do gateway."
    });
  } catch (error) {
    res.status(400).json({
      error: error.message || "Não foi possível criar o pedido."
    });
  }
});

/* ADMIN */

app.post("/api/admin/login", (req, res) => {
  const username =
    process.env.ADMIN_USER || "admin";

  const password =
    process.env.ADMIN_PASSWORD || "";

  const inputUser = String(
    req.body?.username || ""
  );

  const inputPassword = String(
    req.body?.password || ""
  );

  if (
    inputUser !== username ||
    inputPassword !== password
  ) {
    return res.status(401).json({
      error: "Credenciais inválidas."
    });
  }

  res.json({
    success: true,
    username
  });
});

app.post("/api/admin/logout", (req, res) => {
  res.json({
    success: true
  });
});

app.get("/api/admin/me", (req, res) => {
  res.json({
    username: process.env.ADMIN_USER || "admin",
    role: "admin"
  });
});

app.get("/api/admin/products", (req, res) => {
  res.json(products);
});

app.get("/api/admin/orders", (req, res) => {
  res.json(orders);
});

app.patch("/api/admin/orders/:id", (req, res) => {
  const allowed = [
    "Aguardando pagamento",
    "Pedido em preparação",
    "Pedido enviado",
    "Em transporte",
    "Entregue",
    "Cancelado"
  ];

  const status = String(req.body?.status || "");

  if (!allowed.includes(status)) {
    return res.status(400).json({
      error: "Status inválido."
    });
  }

  const order = orders.find(
    (item) => item.id === Number(req.params.id)
  );

  if (!order) {
    return res.status(404).json({
      error: "Pedido não encontrado."
    });
  }

  order.status = status;

  res.json({
    success: true
  });
});

/* SEO */

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(
    "User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n"
  );
});

app.get("/sitemap.xml", (req, res) => {
  const host =
    process.env.STORE_URL ||
    `https://${req.get("host")}`;

  const urls = [
    "/",
    "/tenis",
    ...products.map(
      (p) => `/tenis/${slugify(p.nome)}`
    )
  ];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    urls
      .map(
        (url) =>
          `<url><loc>${host}${url}</loc></url>`
      )
      .join("") +
    "</urlset>";

  res.type("application/xml").send(xml);
});

/* PRODUTO */

app.get("/tenis/:slug", (req, res) => {
  const product = products.find(
    (p) =>
      slugify(p.nome) === req.params.slug ||
      slugify(p.modelo) === req.params.slug
  );

  if (!product) {
    return res.status(404).send("Produto não encontrado.");
  }

  res.sendFile(
    path.join(__dirname, "..", "public", "index.html")
  );
});

/* ARQUIVOS DO SITE */

app.use(
  express.static(
    path.join(__dirname, "..", "public")
  )
);

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "..", "public", "index.html")
  );
});

/*
  Vercel usa o export da aplicação.
  Localmente também pode ser executado com:
  node src/server.js
*/

module.exports = app;

if (require.main === module) {
  const PORT = Number(
    process.env.PORT || 3000
  );

  app.listen(PORT, () => {
    console.log(
      `BAIDREN rodando em http://localhost:${PORT}`
    );
  });
}
