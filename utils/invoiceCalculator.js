const roundMoney = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round((number + Number.EPSILON) * 100) / 100;
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveDiscountAmount = (subtotal, discount = {}) => {
  const type = discount?.type || 'fixed';
  const percentage = toNumber(discount?.percentage, 0);
  const amount = toNumber(discount?.amount, 0);

  if (type === 'percentage') {
    return roundMoney(subtotal * (percentage / 100));
  }
  return roundMoney(amount);
};

const normalizeItems = (items = []) => {
  return (Array.isArray(items) ? items : []).map((item) => {
    const quantity = toNumber(item.quantity, 0);
    const unitPrice = toNumber(item.unitPrice, 0);
    const taxRate = toNumber(item.taxRate, 0);
    const discount = toNumber(item.discount, 0);
    const discountType = item.discountType || 'fixed';

    if (quantity < 0) {
      throw new Error('Item quantity cannot be negative');
    }
    if (unitPrice < 0) {
      throw new Error('Item unit price cannot be negative');
    }

    let itemTotal = unitPrice * quantity;
    if (discount > 0) {
      if (discountType === 'percentage') {
        itemTotal -= itemTotal * (discount / 100);
      } else {
        itemTotal -= discount;
      }
    }

    if (itemTotal < 0) {
      itemTotal = 0;
    }

    const taxAmount = roundMoney(itemTotal * (taxRate / 100));
    const total = roundMoney(itemTotal + taxAmount);

    return {
      ...item,
      quantity,
      unitPrice,
      taxRate,
      taxAmount,
      total,
      discount,
      discountType
    };
  });
};

const calculateInvoiceTotals = ({
  items = [],
  discount = {},
  shipping = {},
  taxRateUsed = 0,
  taxAmountOverride = null,
  isTaxOverridden = false,
  amountPaid = 0
}) => {
  const normalizedItems = normalizeItems(items);
  const subtotal = roundMoney(
    normalizedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  );

  const discountAmount = resolveDiscountAmount(subtotal, discount);
  const shippingAmount = roundMoney(toNumber(shipping?.amount, 0));
  const taxableAmount = Math.max(0, subtotal - discountAmount);

  let taxAmount = 0;
  const resolvedTaxRate = toNumber(taxRateUsed, 0);

  if (isTaxOverridden && taxAmountOverride !== null && taxAmountOverride !== undefined) {
    taxAmount = roundMoney(toNumber(taxAmountOverride, 0));
  } else {
    taxAmount = roundMoney(taxableAmount * (resolvedTaxRate / 100));
  }

  const total = roundMoney(subtotal - discountAmount + taxAmount + shippingAmount);
  if (total < 0) {
    throw new Error('Invoice total cannot be negative');
  }

  const paidAmount = roundMoney(toNumber(amountPaid, 0));
  const balance = roundMoney(Math.max(0, total - paidAmount));

  return {
    items: normalizedItems,
    subtotal,
    discountAmount,
    taxAmount,
    taxRateUsed: resolvedTaxRate,
    shippingAmount,
    total,
    amountPaid: paidAmount,
    balance
  };
};

module.exports = {
  roundMoney,
  toNumber,
  normalizeItems,
  calculateInvoiceTotals
};
