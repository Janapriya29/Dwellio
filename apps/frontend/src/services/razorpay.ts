import { CreatePaymentOrderResponseData } from '@dwellio/shared';

declare global {
  interface Window {
    Razorpay?: any;
  }
}

/**
 * Dynamically loads the Razorpay checkout script if not already present.
 */
export const loadRazorpayScript = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.error('Failed to load Razorpay Checkout script.');
      resolve(false);
    };

    document.body.appendChild(script);
  });
};

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface OpenRazorpayOptions {
  orderData: CreatePaymentOrderResponseData;
  onSuccess: (response: RazorpaySuccessResponse) => void | Promise<void>;
  onDismiss?: () => void;
  onError?: (error: any) => void;
}

/**
 * Initializes and opens Razorpay Standard Checkout in TEST MODE.
 */
export const openRazorpayCheckout = async ({
  orderData,
  onSuccess,
  onDismiss,
  onError,
}: OpenRazorpayOptions): Promise<void> => {
  const loaded = await loadRazorpayScript();
  if (!loaded || !window.Razorpay) {
    const err = new Error('Razorpay SDK could not be loaded. Please check your internet connection.');
    onError?.(err);
    throw err;
  }

  const options = {
    key: orderData.keyId,
    amount: orderData.amount, // in paise
    currency: orderData.currency || 'INR',
    name: orderData.businessName || 'Dwellio Home Services',
    description: orderData.description || 'Home Service Booking Payment',
    order_id: orderData.orderId,
    prefill: {
      name: orderData.customer?.name || '',
      email: orderData.customer?.email || '',
      contact: orderData.customer?.phone || '',
    },
    theme: {
      color: '#4F46E5', // Dwellio primary indigo
    },
    modal: {
      ondismiss: () => {
        onDismiss?.();
      },
    },
    handler: async (response: RazorpaySuccessResponse) => {
      try {
        await onSuccess(response);
      } catch (err) {
        onError?.(err);
      }
    },
  };

  const razorpayInstance = new window.Razorpay(options);
  razorpayInstance.on('payment.failed', (failedResponse: any) => {
    onError?.(failedResponse?.error || new Error('Payment failed at gateway'));
  });

  razorpayInstance.open();
};
