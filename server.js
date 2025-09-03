// import express from "express";
// import dotenv from "dotenv";

// dotenv.config();
// const app = express();
// const port = 3000;

// app.get("/orders", async (req, res) => {
//   try {
//     const query = `{
//       orders(first: 100, sortKey: CREATED_AT, reverse: true) {
//         edges {
//           node {
//             id
//             name
//             createdAt
//             totalPriceSet {
//               shopMoney {
//                 amount
//                 currencyCode
//               }
//             }
//             customer {
//               firstName
//               lastName
//               email
//             }
//           }
//         }
//       }
//     }`;

//     const response = await fetch(
//       `https://${process.env.SHOPIFY_SHOP}/admin/api/2025-01/graphql.json`,
//       {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
//         },
//         body: JSON.stringify({ query }),
//       }
//     );

//     const data = await response.json();
//     res.json(data.data.orders.edges.map(edge => edge.node));
//   } catch (err) {
//     console.error(err);
//     res.status(500).send("Error fetching orders");
//   }
// });

// app.listen(port, () => {
//   console.log(`🚀 Server running at http://localhost:${port}`);
// });


import express from "express";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = 3000;

app.get("/orders", async (req, res) => {
  try {
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

    console.log(JSON.stringify(data, null, 2), 'jsobn');

    // Transform Shopify order → your schema
    const transformed = data.data.orders.edges.map(({ node }, idx) => ({
      billing_addressln: node.billingAddress?.address1 || "",
      billing_addressln2: node.billingAddress?.address2 || null,
      billing_city: node.billingAddress?.city || "",
      billing_country: node.billingAddress?.country || "",
      billing_country_code: "", // Shopify doesn’t return directly, you may need mapping
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
      orderdate: new Date().toISOString().split("T")[0],
      orderdate_formatted: null,
      orderdate_utc: new Date().toISOString(),
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
        product_sku: li.node.sku,
        productshortname: li.node.title,
        quantity: li.node.quantity,
        taxRate: 0,
        unitPrice: parseFloat(li.node.originalUnitPriceSet.shopMoney.amount),
      })),

      seller_email: "contact@auroratech.in",
      seller_orderid: idx + 1,
      seller_ordernumber: `ORD-${idx + 1}`,
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
    console.error(err);
    res.status(500).send("Error fetching orders");
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
