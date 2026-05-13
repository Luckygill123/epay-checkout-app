const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend Running");
});

app.get("/apps/epay/products", async (req, res) => {

  try {

    const response = await axios.get(
      "https://dummyjson.com/products"
    );

    const products = response.data.products;

    const html = `
      <html>

      <head>

        <title>Epay Products</title>

        <style>

          body {
            font-family: Arial;
            background: #f5f5f5;
            margin: 0;
            padding: 30px;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
          }

          .card {
            background: white;
            border-radius: 12px;
            overflow: hidden;
            padding: 15px;
          }

          img {
            width: 100%;
            height: 200px;
            object-fit: cover;
          }

          button {
            width: 100%;
            padding: 12px;
            background: black;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
          }

        </style>

      </head>

      <body>

        <h1>Epay Products</h1>

        <div class="grid">

          ${products.map(product => `

            <div class="card">

              <img src="${product.thumbnail}" />

              <h3>${product.title}</h3>

              <p>₹${product.price}</p>

              <button onclick="buyNow()">
                Buy Now
              </button>

            </div>

          `).join("")}

        </div>

        <script>

          async function buyNow() {

            // Replace with real Shopify Variant ID
            const variantId = 123456789;

            await fetch('/cart/add.js', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                id: variantId,
                quantity: 1
              })
            });

            window.location.href = '/checkout';
          }

        </script>

      </body>

      </html>
    `;

    res.send(html);

  } catch (err) {

    res.status(500).send(err.message);

  }

});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log("Server Running");
});