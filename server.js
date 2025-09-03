import express from "express";
import dotenv from "dotenv";
import cors from "cors";
dotenv.config();

const app = express();
const port = 4000;

// ✅ More permissive CORS configuration for development
const allowedOrigins = [
  "http://localhost:3000",   
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "https://yourdomain.com",
  // Add your actual frontend URL here
  "https://apinode.zapconnecthub.com"
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman, etc.)
      if (!origin) return callback(null, true);
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log(`CORS blocked origin: ${origin}`);
        callback(new Error(`CORS not allowed for origin: ${origin}`));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type", 
      "Authorization", 
      "filtercriteria",
      "X-Requested-With",
      "Accept",
      "Origin"
    ],
    credentials: true,
  })
);

// ✅ Add body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Handle preflight requests explicitly
app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, filtercriteria, X-Requested-With, Accept, Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  res.sendStatus(200);
});

// ✅ Add a simple health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.get("/orders", async (req, res) => {
  try {
    // Log the request origin for debugging
    console.log(`Request from origin: ${req.headers.origin || 'No origin'}`);
    console.log(`Request headers:`, req.headers);

    const query = `
      {
        orders(first: 10, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                firstName
                lastName
                email
              }
              shippingAddress {
                address1
                address2
                city
                province
                country
                zip
                phone
              }
              billingAddress {
                address1
                address2
                city
                province
                country
                zip
                phone
              }
              lineItems(first: 20) {
                edges {
                  node {
                    title
                    sku
                    quantity
                    originalUnitPriceSet {
                      shopMoney {
                        amount
                        currencyCode
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch(
      `https://${process.env.SHOPIFY_SHOP}/admin/api/2025-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({ query }),
      }
    );

    const data = await response.json();

    // Check if Shopify returned an error
    if (data.errors) {
      console.error("Shopify GraphQL errors:", data.errors);
      return res.status(400).json({ error: "Shopify API error", details: data.errors });
    }

    if (!data.data || !data.data.orders) {
      console.error("Unexpected Shopify response structure:", data);
      return res.status(500).json({ error: "Unexpected response from Shopify API" });
    }

    console.log(`Fetched ${data.data.orders.edges.length} orders from Shopify`);

    // Transform Shopify order → your schema
    const transformed = data.data.orders.edges.map(({ node }, idx) => ({
      billing_addressln: node.billingAddress?.address1 || "",
      billing_addressln2: node.billingAddress?.address2 || null,
      billing_city: node.billingAddress?.city || "",
      billing_country: node.billingAddress?.country || "",
      billing_country_code: "", // Shopify doesn't return directly, you may need mapping
      billing_country_code_id: "",
      billing_customer_name: `${node.customer?.firstName || ""} ${node.customer?.lastName || ""}`.trim(),
      billing_email: node.customer?.email || "",
      billing_isd_code: "",
      billing_last_name: node.customer?.lastName || "",
      billing_phone: node.billingAddress?.phone || "",
      billing_pincode: node.billingAddress?.zip || "",
      billing_state: node.billingAddress?.province || "",

      courier_awb_data: null,
      courier_awb_no: null,
      courier_invoice_amt: null,
      courier_invoice_amt_currency: null,
      courier_invoice_no: null,
      courier_partner_id: null,
      courier_partner_name: null,
      courier_payment_method: null,

      created_at: new Date().toISOString().split("T")[0],
      cust_addressln: node.shippingAddress?.address1 || "",
      cust_addressln2: node.shippingAddress?.address2 || null,
      cust_city: node.shippingAddress?.city || "",
      cust_contact_no: node.shippingAddress?.phone || "",
      cust_country_code: "",
      cust_country_code_id: "",
      cust_customer_name: `${node.customer?.firstName || ""} ${node.customer?.lastName || ""}`.trim(),
      cust_email: node.customer?.email || "",
      cust_isd_code: "",
      cust_last_name: node.customer?.lastName || "",
      cust_pincode: node.shippingAddress?.zip || "",
      cust_state: node.shippingAddress?.province || "",
      cust_useremail: node.customer?.email || "",

      customer_name: `${node.customer?.firstName || ""} ${node.customer?.lastName || ""}`.trim(),
      declared_value: node.totalPriceSet?.shopMoney?.amount || "0",
      declared_value_currency: node.totalPriceSet?.shopMoney?.currencyCode || "",

      dispatch_actual_date: null,
      dispatch_expected_date: null,
      isactive: true,
      orderdate: new Date(node.createdAt).toISOString().split("T")[0],
      orderdate_formatted: null,
      orderdate_utc: new Date(node.createdAt).toISOString(),
      out_for_delivery_actual_date: null,
      pickup_actual_date: null,
      pickup_addressln: "",
      pickup_addressln2: null,
      pickup_awb_no: null,
      pickup_city: "",
      pickup_country_code: null,
      pickup_email: "",
      pickup_expected_date: null,
      pickup_isd_code: "",
      pickup_last_name: "",
      pickup_phone: "",
      pickup_pincode: "",
      pickup_seller_name: "",
      pickup_state: "",
      pickup_status: null,
      pickup_status_desc: null,

      pkg_applicable_weight: "0",
      pkg_applicable_weight_unit: "kg",
      pkg_dim_breadth: 0.0,
      pkg_dim_height: 0.0,
      pkg_dim_length: 0.0,
      pkg_dim_unit: "cm",
      pkg_volumetric_weight: "0",
      pkg_volumetric_weight_unit: "kg",
      pkg_weight: "0",
      pkg_weight_unit: "kg",

      products: node.lineItems.edges.map((li, i) => ({
        cod_charges: 0,
        cod_charges_currency: "INR",
        discount: 0,
        id: i + 1,
        product_hsn_code: "",
        product_name: li.node.title,
        product_pkg_dim_breadth: 0,
        product_pkg_dim_height: 0,
        product_pkg_dim_length: 0,
        product_pkg_dim_unit: "cm",
        product_pkg_volumetric_weight: 0,
        product_pkg_volumetric_weight_unit: "kg",
        product_pkg_weight: 0,
        product_pkg_weight_unit: "kg",
        product_qc_details: {
          inspected_by: "",
          inspection_date: "",
          notes: "",
          qc_passed: true,
        },
        product_sku: li.node.sku || "",
        productshortname: li.node.title,
        quantity: li.node.quantity,
        taxRate: 0,
        unitPrice: parseFloat(li.node.originalUnitPriceSet?.shopMoney?.amount || 0),
      })),

      // Use actual Shopify order ID and name instead of index
      seller_email: "contact@auroratech.in",
      seller_orderid: node.id,
      seller_ordernumber: node.name,
      seller_reg_id: 2,
      sellername: "Aurora Tech",

      shipping_addressln: node.shippingAddress?.address1 || "",
      shipping_addressln2: node.shippingAddress?.address2 || null,
      shipping_city: node.shippingAddress?.city || "",
      shipping_country_code: "",
      shipping_country_code_id: "",
      shipping_customer_name: `${node.customer?.firstName || ""} ${node.customer?.lastName || ""}`.trim(),
      shipping_email: node.customer?.email || "",
      shipping_isd_code: "",
      shipping_last_name: node.customer?.lastName || "",
      shipping_phone: node.shippingAddress?.phone || "",
      shipping_pincode: node.shippingAddress?.zip || "",
      shipping_state: node.shippingAddress?.province || "",
      shipping_type: "EXP",

      ts: new Date().toISOString(),
    }));

    res.json(transformed);
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({ 
      error: "Error fetching orders", 
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// ✅ Error handling middleware
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);
  res.status(500).json({ 
    error: "Internal server error",
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://0.0.0.0:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Shopify Shop: ${process.env.SHOPIFY_SHOP || 'Not configured'}`);
});
