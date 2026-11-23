import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Booking } from '../models/Booking';
import { Payment } from '../models/Payment';
import { PaymentWebhookEvent } from '../models/PaymentWebhookEvent';
import { AuditLog } from '../models/AuditLog';
import { razorpayService } from '../services/razorpayService';
import { couponService } from '../services/couponService';
import { config } from '../config/env';
import { sendInAppNotification } from '../utils/notification';
import { sendInternalError } from '../utils/security';
import { reconcilePaymentCapture } from '../utils/payment';
import {
  ApiResponse,
  CreatePaymentOrderPayload,
  CreatePaymentOrderResponseData,
  VerifyPaymentPayload,
  PaymentData,
} from '@dwellio/shared';

/**
 * Customer: Create a Razorpay Payment Order for an Accepted Booking
 * POST /api/payments/create-order
 */
export const createPaymentOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    const { bookingId, couponCode }: CreatePaymentOrderPayload = req.body || {};

    if (!bookingId || !Types.ObjectId.isValid(bookingId)) {
      res.status(400).json({ success: false, message: 'Invalid booking ID format.' });
      return;
    }

    const booking = await Booking.findById(bookingId)
      .populate('serviceId', 'name basePrice price')
      .populate('providerId', 'displayName phone')
      .populate('customerId', 'name email phone');

    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    // Verify booking ownership
    const bookingCustId = (booking.customerId as any)?._id || booking.customerId;
    if (bookingCustId.toString() !== req.user._id.toString()) {
      res.status(403).json({ success: false, message: 'Access denied: You do not own this booking.' });
      return;
    }

    // Must be in 'accepted' state to pay (per Product Decision 4.1)
    if (booking.status !== 'accepted') {
      res.status(400).json({
        success: false,
        message: `Booking cannot be paid in current status "${booking.status}". Payment is only available after provider acceptance.`,
      });
      return;
    }

    // Check if already paid
    if (booking.paymentStatus === 'paid') {
      res.status(400).json({
        success: false,
        message: 'This booking has already been paid and confirmed.',
      });
      return;
    }

    // Check payment deadline (2 hours from acceptance)
    const now = new Date();
    if (booking.paymentDueAt && booking.paymentDueAt < now) {
      res.status(400).json({
        success: false,
        message: 'Payment window has expired for this booking. Please schedule a new appointment.',
      });
      return;
    }

    // Calculate base price strictly on backend
    const basePriceRupees = booking.priceSnapshot || (booking.serviceId as any)?.basePrice || 499;

    let discountRupees = 0;
    let validatedCoupon: any = null;

    if (couponCode && typeof couponCode === 'string' && couponCode.trim().length > 0) {
      const validation = await couponService.validateCoupon(
        couponCode.trim(),
        req.user._id,
        basePriceRupees
      );

      if (!validation.valid) {
        res.status(400).json({
          success: false,
          message: validation.message || 'Invalid coupon code.',
        });
        return;
      }

      discountRupees = validation.discountAmountRupees;
      validatedCoupon = validation.coupon;
    }

    const finalPayableRupees = Math.max(0, basePriceRupees - discountRupees);
    const amountPaise = finalPayableRupees * 100;

    const receipt = `rcpt_${booking._id.toString().slice(-10)}_${Date.now().toString().slice(-4)}`;
    const serviceName = (booking.serviceId as any)?.name || 'Home Service';

    // Call Razorpay Order Creation API
    const order = await razorpayService.createOrder({
      amountPaise,
      currency: 'INR',
      receipt,
      notes: {
        bookingId: booking._id.toString(),
        customerId: req.user._id.toString(),
        providerId: booking.providerId._id.toString(),
        serviceName,
        couponCode: validatedCoupon ? validatedCoupon.code : 'NONE',
      },
    });

    // Create Payment tracking record
    const payment = new Payment({
      bookingId: booking._id,
      customerId: req.user._id,
      providerId: booking.providerId._id,
      razorpayOrderId: order.id,
      amount: amountPaise,
      currency: 'INR',
      status: 'created',
      receipt,
      notes: {
        couponCode: validatedCoupon?.code,
      },
    });
    await payment.save();

    // Reserve coupon usage if applicable (atomically enforces usageLimit)
    if (validatedCoupon) {
      try {
        await couponService.reserveCoupon(
          validatedCoupon._id,
          booking._id,
          req.user._id,
          validatedCoupon.code,
          discountRupees * 100
        );
        booking.appliedCouponCode = validatedCoupon.code;
      } catch (couponReserveErr: any) {
        await Payment.findByIdAndDelete(payment._id).catch(() => {});
        res.status(400).json({
          success: false,
          message: couponReserveErr.message || 'Failed to reserve coupon usage.',
        });
        return;
      }
    }

    // Attach order reference to booking
    booking.razorpayOrderId = order.id;
    booking.discountAmount = discountRupees;
    booking.finalPayableAmount = finalPayableRupees;
    await booking.save();

    // Audit log
    await new AuditLog({
      adminId: req.user._id,
      action: 'PAYMENT_ORDER_CREATED',
      targetId: booking._id,
      targetType: 'Booking',
      details: {
        bookingId: booking._id,
        orderId: order.id,
        amountPaise,
        discountRupees,
        couponCode: validatedCoupon?.code,
      },
    }).save().catch(() => {});

    const responseData: CreatePaymentOrderResponseData = {
      orderId: order.id,
      amount: amountPaise,
      currency: 'INR',
      keyId: config.razorpayKeyId,
      bookingId: booking._id.toString(),
      discountAmount: discountRupees * 100,
      finalPayableAmount: amountPaise,
      businessName: 'Dwellio Home Services',
      description: `Payment for ${serviceName}`,
      customer: {
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone,
      },
    };

    const response: ApiResponse<CreatePaymentOrderResponseData> = {
      success: true,
      message: 'Razorpay payment order generated successfully.',
      data: responseData,
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'PaymentController.createPaymentOrder', error, 'Failed to create payment order.');
  }
};

/**
 * Customer: Verify Razorpay Checkout Signature and Complete Payment
 * POST /api/payments/verify
 */
export const verifyPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    const {
      bookingId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    }: VerifyPaymentPayload = req.body || {};

    if (!bookingId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      res.status(400).json({
        success: false,
        message: 'Missing required payment verification parameters (bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature).',
      });
      return;
    }

    const booking = await Booking.findById(bookingId).populate('serviceId', 'name');
    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found.' });
      return;
    }

    // Ownership check
    if (booking.customerId.toString() !== req.user._id.toString()) {
      res.status(403).json({ success: false, message: 'Access denied: You do not own this booking.' });
      return;
    }

    // Idempotent check: If already marked as paid with this payment ID, return success immediately
    if (booking.paymentStatus === 'paid' && booking.razorpayPaymentId === razorpayPaymentId) {
      res.status(200).json({
        success: true,
        message: 'Payment has already been verified and processed.',
        data: {
          bookingId: booking._id.toString(),
          paymentStatus: 'paid',
          razorpayPaymentId,
        },
      });
      return;
    }

    // Verify Cryptographic HMAC SHA256 Signature
    const isValidSignature = razorpayService.verifyPaymentSignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    );

    if (!isValidSignature) {
      // Record payment failure
      await Payment.findOneAndUpdate(
        { razorpayOrderId },
        {
          $set: {
            status: 'failed',
            errorCode: 'SIGNATURE_VERIFICATION_FAILED',
            errorDescription: 'The cryptographic HMAC SHA256 payment signature did not match.',
          },
        }
      );

      await new AuditLog({
        adminId: req.user._id,
        action: 'PAYMENT_FAILED',
        targetId: booking._id,
        targetType: 'Booking',
        details: {
          bookingId: booking._id,
          razorpayOrderId,
          razorpayPaymentId,
          reason: 'HMAC signature mismatch',
        },
      }).save().catch(() => {});

      res.status(400).json({
        success: false,
        message: 'Payment verification failed: Cryptographic signature mismatch. Funds were not captured.',
      });
      return;
    }

    // Reconcile and capture payment using shared concurrency-safe flow
    const reconcileResult = await reconcilePaymentCapture({
      bookingId: booking._id,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      source: 'checkout_verify',
      actorUserId: req.user._id,
    });

    if (reconcileResult.refundedDueToCancellation) {
      res.status(200).json({
        success: true,
        message: 'Payment was captured but the booking appointment had expired. An automatic 100% refund has been processed.',
        data: {
          bookingId: booking._id.toString(),
          paymentStatus: 'refunded',
          refundStatus: 'processed',
          refundedDueToCancellation: true,
          razorpayPaymentId,
          razorpayOrderId,
        },
      });
      return;
    }

    const response: ApiResponse<any> = {
      success: true,
      message: 'Payment verified and captured successfully. Your booking is confirmed!',
      data: {
        bookingId: booking._id.toString(),
        paymentStatus: 'paid',
        razorpayPaymentId,
        razorpayOrderId,
      },
    };
    res.status(200).json(response);
  } catch (error: any) {
    sendInternalError(res, 'PaymentController.verifyPayment', error, 'Failed to verify payment.');
  }
};

/**
 * Gateway Webhook Handler: Ingest and process asynchronous Razorpay Webhooks
 * POST /api/payments/webhook
 */
export const handlePaymentWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    if (!signature) {
      res.status(400).json({ success: false, message: 'Missing x-razorpay-signature header.' });
      return;
    }

    // Verify webhook signature
    const isValid = razorpayService.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      res.status(400).json({ success: false, message: 'Invalid webhook signature.' });
      return;
    }

    const payload = req.body || {};
    const eventType = payload.event;
    const eventId = (req.headers['x-razorpay-event-id'] as string) || `evt_${Date.now()}_${Math.random()}`;

    const STALE_LEASE_MS = 30000;
    const staleThreshold = new Date(Date.now() - STALE_LEASE_MS);

    // 1. Check existing event status
    const existingEvent = await PaymentWebhookEvent.findOne({ eventId });
    if (existingEvent) {
      if (existingEvent.processingStatus === 'processed') {
        res.status(200).json({ success: true, message: 'Event already processed.' });
        return;
      }
      if (existingEvent.processingStatus === 'processing' && existingEvent.updatedAt > staleThreshold) {
        // Active in-flight lease held by another worker - return 409 Conflict so gateway knows it's pending
        res.status(409).json({ success: false, message: 'Webhook event is currently being processed.' });
        return;
      }
    }

    // 2. Atomic processing claim or lease takeover
    let webhookEvent = await PaymentWebhookEvent.findOneAndUpdate(
      {
        eventId,
        $or: [
          { processingStatus: 'failed' },
          { processingStatus: 'processing', updatedAt: { $lte: staleThreshold } },
        ],
      },
      {
        $set: {
          processingStatus: 'processing',
          updatedAt: new Date(),
        },
        $inc: { retryCount: 1 },
      },
      { returnDocument: 'after' }
    );

    if (!webhookEvent) {
      // Brand new event: insert with status 'processing'
      try {
        webhookEvent = new PaymentWebhookEvent({
          eventId,
          eventType,
          payload,
          signature,
          processingStatus: 'processing',
        });
        await webhookEvent.save();
      } catch (saveErr: any) {
        const isDuplicateKey =
          saveErr.code === 11000 ||
          (saveErr.name === 'MongoServerError' && saveErr.code === 11000) ||
          (saveErr.message && saveErr.message.includes('E11000'));

        if (isDuplicateKey) {
          const dup = await PaymentWebhookEvent.findOne({ eventId });
          if (dup?.processingStatus === 'processed') {
            res.status(200).json({ success: true, message: 'Event already processed.' });
            return;
          }
          res.status(409).json({ success: false, message: 'Webhook event is currently being processed.' });
          return;
        }
        throw saveErr;
      }
    }

    try {
      // Process Supported Events
      if (eventType === 'payment.captured' || eventType === 'order.paid') {
        const paymentEntity = payload.payload?.payment?.entity || {};
        const orderId = paymentEntity.order_id || payload.payload?.order?.entity?.id;
        const paymentId = paymentEntity.id;

        if (orderId && paymentId) {
          // Shared concurrency-safe reconciliation flow (Finding 2)
          await reconcilePaymentCapture({
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
            source: 'webhook',
          });
        }
      } else if (eventType === 'payment.failed') {
        const paymentEntity = payload.payload?.payment?.entity || {};
        const orderId = paymentEntity.order_id;
        if (orderId) {
          const payment = await Payment.findOne({ razorpayOrderId: orderId });
          if (payment && payment.status === 'created') {
            payment.status = 'failed';
            payment.errorCode = paymentEntity.error_code || 'GATEWAY_DECLINE';
            payment.errorDescription = paymentEntity.error_description || 'Payment was declined by gateway.';
            await payment.save();

            await couponService.releaseCouponReservation(payment.bookingId, 'Payment failed at gateway').catch(() => {});
          }
        }
      }

      webhookEvent.processingStatus = 'processed';
      webhookEvent.processedAt = new Date();
      webhookEvent.error = undefined;
      await webhookEvent.save();

      res.status(200).json({ success: true, message: 'Webhook event processed successfully.' });
    } catch (processErr: any) {
      if (webhookEvent && webhookEvent.processingStatus !== 'processed') {
        webhookEvent.processingStatus = 'failed';
        webhookEvent.error = processErr?.message || 'Processing error';
        await webhookEvent.save().catch(() => {});
      }
      throw processErr;
    }
  } catch (error: any) {
    console.error('[PaymentWebhook] Error processing webhook:', error);
    res.status(500).json({ success: false, message: 'Internal error processing webhook event.' });
  }
};
