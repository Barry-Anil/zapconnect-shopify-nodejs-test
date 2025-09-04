import express from "express";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// ✅ Simple and reliable CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      "http://localhost:3000",   
      "http://127.0.0.1:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3001",
      "https://yourdomain.com",
      "https://apinode.zapconnecthub.com"
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log(`CORS blocked origin: ${origin}`);
      callback(null, true); // Allow all origins for now to debug
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'filtercriteria',
    'X-Requested-With',
    'Accept',
    'Origin'
  ]
};

// Apply CORS middleware
app.use(cors(corsOptions));

// ✅ Add body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ Add request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${req.headers.origin || 'No origin'}`);
  next();
});

// ✅ In-memory storage for processed orders (to avoid duplicates)
let processedOrders = new Set();

// ✅ Function to send order to ZapConnect API
async function sendToZapConnect(orderData) {
  try {
    console.log(`Sending order ${orderData.seller_ordernumber} to ZapConnect API...`);
    
    const response = await fetch('https://apiseller.zapconnecthub.com/api/seller/add/order/detail/v3', {
      method: 'POST',
      headers: {
        'x-api-key': 'ABCD@1234',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ZapConnect API error for order ${orderData.seller_ordernumber}:`, {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        details: errorText
      };
    }

    const result = await response.json();
    console.log(`✅ Successfully sent order ${orderData.seller_ordernumber} to ZapConnect`);
    return {
      success: true,
      data: result
    };

  } catch (error) {
    console.error(`Error sending order ${orderData.seller_ordernumber} to ZapConnect:`, error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ✅ Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    processedOrdersCount: processedOrders.size
  });
});

// ✅ Root endpoint
app.get("/", (req, res) => {
  res.json({ 
    message: "Shopify Orders API with ZapConnect Integration", 
    endpoints: ["/health", "/orders", "/clear-cache"],
    timestamp: new Date().toISOString()
  });
});

// ✅ Clear processed orders cache (useful for testing)
app.post("/clear-cache", (req, res) => {
  processedOrders.clear();
  console.log("Processed orders cache cleared");
  res.json({ 
    message: "Cache cleared successfully",
    timestamp: new Date().toISOString()
  });
});

app.get("/orders", async (req, res) => {
  try {
    // Validate environment variables
    if (!process.env.SHOPIFY_SHOP || !process.env.SHOPIFY_ACCESS_TOKEN) {
      return res.status(500).json({ 
        error: "Missing Shopify configuration",
        details: "SHOPIFY_SHOP and SHOPIFY_ACCESS_TOKEN must be set"
      });
    }

    console.log(`Fetching orders from: ${process.env.SHOPIFY_SHOP}`);

    const query = `
      {
        orders(first: 100, sortKey: CREATED_AT, reverse: true) {
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

    const shopifyResponse = await fetch(
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

    if (!shopifyResponse.ok) {
      throw new Error(`Shopify API responded with status: ${shopifyResponse.status}`);
    }

    const data = await shopifyResponse.json();

    // Check for GraphQL errors
    if (data.errors) {
      console.error("Shopify GraphQL errors:", data.errors);
      return res.status(400).json({ 
        error: "Shopify API error", 
        details: data.errors 
      });
    }

    if (!data.data || !data.data.orders) {
      console.error("Unexpected Shopify response structure:", data);
      return res.status(500).json({ 
        error: "Unexpected response from Shopify API",
        received: data
      });
    }

    console.log(`Successfully fetched ${data.data.orders.edges.length} orders from Shopify`);

    // Transform Shopify orders to your schema
    const transformedOrders = data.data.orders.edges.map(({ node }, idx) => {
      const customerName = `${node.customer?.firstName || ""} ${node.customer?.lastName || ""}`.trim();
      
      return {
        // Billing information
        billing_addressln: node.billingAddress?.address1 || "",
        billing_addressln2: node.billingAddress?.address2 || null,
        billing_city: node.billingAddress?.city || "",
        billing_country: node.billingAddress?.country || "",
        billing_country_code: "",
        billing_country_code_id: "",
        billing_customer_name: customerName,
        billing_email: node.customer?.email || "",
        billing_isd_code: "",
        billing_last_name: node.customer?.lastName || "",
        billing_phone: node.billingAddress?.phone || "",
        billing_pincode: node.billingAddress?.zip || "",
        billing_state: node.billingAddress?.province || "",

        // Courier information (null for now)
        courier_awb_data: null,
        courier_awb_no: null,
        courier_invoice_amt: null,
        courier_invoice_amt_currency: null,
        courier_invoice_no: null,
        courier_partner_id: null,
        courier_partner_name: null,
        courier_payment_method: null,

        // Order dates
        created_at: new Date(node.createdAt).toISOString().split("T")[0],
        orderdate: new Date(node.createdAt).toISOString().split("T")[0],
        orderdate_formatted: null,
        orderdate_utc: new Date(node.createdAt).toISOString(),

        // Customer information
        cust_addressln: node.shippingAddress?.address1 || "",
        cust_addressln2: node.shippingAddress?.address2 || null,
        cust_city: node.shippingAddress?.city || "",
        cust_contact_no: node.shippingAddress?.phone || "",
        cust_country_code: "",
        cust_country_code_id: "",
        cust_customer_name: customerName,
        cust_email: node.customer?.email || "",
        cust_isd_code: "",
        cust_last_name: node.customer?.lastName || "",
        cust_pincode: node.shippingAddress?.zip || "",
        cust_state: node.shippingAddress?.province || "",
        cust_useremail: node.customer?.email || "",

        customer_name: customerName,
        declared_value: node.totalPriceSet?.shopMoney?.amount || "0",
        declared_value_currency: node.totalPriceSet?.shopMoney?.currencyCode || "",

        // Delivery dates (null for now)
        dispatch_actual_date: null,
        dispatch_expected_date: null,
        out_for_delivery_actual_date: null,

        isactive: true,

        // Pickup information (empty for now)
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

        // Package dimensions (defaults)
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

        // Products
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

        // Seller information
        seller_email: "contact@auroratech.in",
        seller_email_x: "contact@auroratech.in",
        seller_orderid: node.id,
        seller_ordernumber: node.name,
        seller_reg_id: 2,
        sellername: "Aurora Tech",

        // Shipping information
        shipping_addressln: node.shippingAddress?.address1 || "",
        shipping_addressln2: node.shippingAddress?.address2 || null,
        shipping_city: node.shippingAddress?.city || "",
        shipping_country_code: "",
        shipping_country_code_id: "",
        shipping_customer_name: customerName,
        shipping_email: node.customer?.email || "",
        shipping_isd_code: "",
        shipping_last_name: node.customer?.lastName || "",
        shipping_phone: node.shippingAddress?.phone || "",
        shipping_pincode: node.shippingAddress?.zip || "",
        shipping_state: node.shippingAddress?.province || "",
        shipping_type: "EXP",

        ts: new Date().toISOString(),
      };
    });

    // ✅ Process new orders and send to ZapConnect
    const newOrders = [];
    const zapConnectResults = [];

    for (const order of transformedOrders) {
      const orderKey = order.seller_orderid; // Using Shopify order ID as unique key
      
      if (!processedOrders.has(orderKey)) {
        console.log(`🆕 New order detected: ${order.seller_ordernumber} (ID: ${orderKey})`);
        newOrders.push(order);
        
        // Send to ZapConnect API
        const zapResult = await sendToZapConnect(order);
        zapConnectResults.push({
          order_id: order.seller_orderid,
          order_number: order.seller_ordernumber,
          zapconnect_result: zapResult
        });
        
        // Mark as processed if successfully sent
        if (zapResult.success) {
          processedOrders.add(orderKey);
        }
      } else {
        console.log(`✅ Order already processed: ${order.seller_ordernumber}`);
      }
    }

    console.log(`📊 Processing summary: ${newOrders.length} new orders, ${transformedOrders.length - newOrders.length} already processed`);

    // Set CORS headers explicitly
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // Return response with processing information
    res.json({
      orders: transformedOrders,
      processing_summary: {
        total_orders: transformedOrders.length,
        new_orders: newOrders.length,
        already_processed: transformedOrders.length - newOrders.length,
        zapconnect_results: zapConnectResults
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error in /orders endpoint:", error);
    
    res.status(500).json({ 
      error: "Internal server error",
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
});

// ✅ 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: "Endpoint not found",
    path: req.path,
    method: req.method
  });
});

// ✅ Global error handler
app.use((error, req, res, next) => {
  console.error("Global error handler:", error);
  res.status(500).json({ 
    error: "Internal server error",
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// Start server
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Server running at http://0.0.0.0:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Shopify Shop: ${process.env.SHOPIFY_SHOP || 'Not configured'}`);
  console.log(`ZapConnect Integration: Enabled`);
  console.log(`Time: ${new Date().toISOString()}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});