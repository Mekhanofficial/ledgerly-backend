const YEARLY_DISCOUNT = 0.2;
const toYearlyPrice = (monthlyPrice) =>
  Number((Number(monthlyPrice) * 12 * (1 - YEARLY_DISCOUNT)).toFixed(2));

const PLAN_DEFINITIONS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 9,
    yearlyPrice: toYearlyPrice(9),
    maxInvoicesPerMonth: 100,
    allowRecurring: false,
    allowApi: false,
    allowMultiCurrency: false,
    allowInventory: false,
    allowCustomerDatabase: true,
    allowWhiteLabel: false,
    allowAdvancedReporting: false,
    maxUsers: 1,
    templateCategories: ['STANDARD']
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    monthlyPrice: 29,
    yearlyPrice: toYearlyPrice(29),
    maxInvoicesPerMonth: Infinity,
    allowRecurring: true,
    allowApi: true,
    allowMultiCurrency: true,
    allowInventory: true,
    allowCustomerDatabase: true,
    allowWhiteLabel: false,
    allowAdvancedReporting: true,
    maxUsers: 5,
    templateCategories: ['STANDARD', 'PREMIUM']
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 79,
    yearlyPrice: toYearlyPrice(79),
    maxInvoicesPerMonth: Infinity,
    allowRecurring: true,
    allowApi: true,
    allowMultiCurrency: true,
    allowInventory: true,
    allowCustomerDatabase: true,
    allowWhiteLabel: true,
    allowAdvancedReporting: true,
    maxUsers: 20,
    templateCategories: ['STANDARD', 'PREMIUM', 'ELITE']
  }
};

const TEMPLATE_PRICING = {
  STANDARD: 5,
  PREMIUM: 12,
  ELITE: 25
};

const TEMPLATE_BUNDLE_PRICE = 79;
const TEMPLATE_BUNDLE_ID = 'bundle_all_templates';
const FREE_TEMPLATE_IDS = new Set(['standard', 'minimal']);

const normalizePlanId = (plan) => {
  if (!plan) return 'starter';
  const value = String(plan).trim().toLowerCase();
  if (value === 'pro') return 'professional';
  if (value === 'free') return 'starter';
  if (value === 'starter' || value === 'professional' || value === 'enterprise') {
    return value;
  }
  return 'starter';
};

const normalizeTemplateCategory = (category) => {
  if (!category) return 'STANDARD';
  const value = String(category).trim().toUpperCase();
  if (value === 'STANDARD' || value === 'PREMIUM' || value === 'ELITE') {
    return value;
  }
  if (value === 'CUSTOM') return 'CUSTOM';
  if (value === 'BASIC') return 'STANDARD';
  return 'STANDARD';
};

const getPlanDefinition = (plan) => PLAN_DEFINITIONS[normalizePlanId(plan)] || PLAN_DEFINITIONS.starter;

const getDefaultTemplatePrice = (category) => TEMPLATE_PRICING[normalizeTemplateCategory(category)] || 0;

const getTemplatePrice = (template) => {
  const category = normalizeTemplateCategory(template?.category);
  if (Number.isFinite(Number(template?.price)) && Number(template.price) > 0) {
    return Number(template.price);
  }
  return getDefaultTemplatePrice(category);
};

const isTemplateIncludedInPlan = (template, planId) => {
  const normalizedPlan = normalizePlanId(planId);
  const flagMap = {
    starter: template?.isIncludedInStarter,
    professional: template?.isIncludedInProfessional,
    enterprise: template?.isIncludedInEnterprise
  };

  if (typeof flagMap[normalizedPlan] === 'boolean') {
    return flagMap[normalizedPlan];
  }

  const planDef = getPlanDefinition(normalizedPlan);
  return planDef.templateCategories.includes(normalizeTemplateCategory(template?.category));
};

const resolveRequiredPlanForTemplate = (template) => {
  if (!template) return 'starter';
  if (isTemplateIncludedInPlan(template, 'starter')) return 'starter';
  if (isTemplateIncludedInPlan(template, 'professional')) return 'professional';
  if (isTemplateIncludedInPlan(template, 'enterprise')) return 'enterprise';
  const category = normalizeTemplateCategory(template.category);
  if (category === 'ELITE') return 'enterprise';
  if (category === 'PREMIUM') return 'professional';
  return 'starter';
};

module.exports = {
  YEARLY_DISCOUNT,
  PLAN_DEFINITIONS,
  TEMPLATE_PRICING,
  TEMPLATE_BUNDLE_PRICE,
  TEMPLATE_BUNDLE_ID,
  FREE_TEMPLATE_IDS,
  normalizePlanId,
  normalizeTemplateCategory,
  getPlanDefinition,
  getDefaultTemplatePrice,
  getTemplatePrice,
  isTemplateIncludedInPlan,
  resolveRequiredPlanForTemplate
};
