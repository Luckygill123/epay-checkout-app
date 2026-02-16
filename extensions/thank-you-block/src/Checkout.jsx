import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';




export default () => {
  render(<Extension />, document.body);
};

function Extension() {

  const checkoutToken = shopify.checkoutToken?.current;
  const lines = shopify.lines?.current
console.log("shopifyData--", shopify)
console.log("orderConfirmation--", shopify.orderConfirmation.current)
console.log("lineData--", lines)
  const [data, setData] = useState(lines);
  const [error, setError] = useState(null);
  const   productIdData  = data[0].merchandise.product.id;
 const idLength  = productIdData.split("/").length;
 const idNum = productIdData.split("/")[idLength - 1]
const orderConfirmationId = shopify.orderConfirmation.current;
const orderId = orderConfirmationId.order.id.split("/")[orderConfirmationId.order.id.split("/").length - 1];
console.log("orderID00", orderId);
const [epay, setEpay] = useState(null);


  useEffect(() => {
    if (!checkoutToken) {
      setError('Checkout token not available');
      return;
    }

    (async () => {
      try {
        console.log('📡 Calling App Proxy with token:', checkoutToken);

  const token = await shopify.sessionToken.get();

  console.log("tokenval", token)

      console.log("orderID--", orderId);
      } catch (err) {
        console.error(err);
        setError('Failed to load payment info');
      }

 
    })();


  }, [checkoutToken]);

  useEffect(() => {
  if (!orderId) return;

  const timer = setTimeout(async () => {
    try {
      console.log("⏳ Waiting 9 seconds before calling API...");
      console.log("📦 Fetching ePay for order:", orderId);

      const response = await fetch(
        `https://epay-shopify-vercel.vercel.app/api/get-order-epay?orderId=${orderId}`
      );

      if (!response.ok) {
        throw new Error("API request failed");
      }

      const json = await response.json();
      console.log("✅ ePay Data received:", json);

      if (!json) {
        setError("Payment data not found");
        return;
      }

      setEpay(json);

    } catch (err) {
      console.error("❌ Fetch error:", err);
      setError("Failed to load payment info");
    }
  }, 9000); // 🔥 9 seconds delay

  // cleanup if component unmounts
  return () => clearTimeout(timer);

}, [orderId]);


  console.log("setEpay--", epay)

      if (error) {
    return <s-text>{error}</s-text>;
  }

  if (!epay) {
      console.log("epaynull--", epay)
    return <s-text>Prepairing Pin information…</s-text>;
  }
const {RESPONSE} = epay;
console.log("RESPONSE--", RESPONSE)
if(RESPONSE?.RESULTTEXT!== "transaction successful" && RESPONSE?.RESULT !==0){
  return  <s-text>{RESPONSE?.RESULTTEXT}</s-text>
}
  return (
    <s-stack gap='base' borderWidth='base' borderRadius="small" padding='small'>
      <s-text>Order Status: {RESPONSE?.RESULTTEXT == "transaction successful" ? 'Success' : 'Failed'}</s-text>
      <s-text>Serial Number: {RESPONSE?.PINCREDENTIALS?.SERIAL}</s-text>
      <s-text>Expiry: {RESPONSE?.PINCREDENTIALS?.VALIDTO}</s-text>
       <s-text>Transaction Date: {RESPONSE?.LOCALDATETIME}</s-text>
       <s-text>Pin: {RESPONSE?.PINCREDENTIALS?.PIN}</s-text>
    </s-stack>
  );
}

