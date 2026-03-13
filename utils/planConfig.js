const YEARLY_DISCOUNT = 0;

const PLAN_DEFINITIONS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 2000,
    yearlyPrice: 24000,
    maxInvoicesPerMonth: 100,
    allowRecurring: false,
    allowApi: false,
    allowMultiCurrency: false,
    allowInventory: false,
    allowCustomLogo: false,
    allowCustomerDatabase: true,
    allowWhiteLabel: false,
    allowAdvancedReporting: false,
    allowLiveChat: false,
    maxUsers: 1,
    templateCategories: ['STANDARD']
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    monthlyPrice: 7000,
    yearlyPrice: 84000,
    maxInvoicesPerMonth: Infinity,
    allowRecurring: true,
    allowApi: true,
    allowMultiCurrency: true,
    allowInventory: true,
    allowCustomLogo: true,
    allowCustomerDatabase: true,
    allowWhiteLabel: false,
    allowAdvancedReporting: true,
    allowLiveChat: false,
    maxUsers: 5,
    templateCategories: ['STANDARD', 'PREMIUM']
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 30000,
    yearlyPrice: 360000,
    maxInvoicesPerMonth: Infinity,
    allowRecurring: true,
    allowApi: true,
    allowMultiCurrency: true,
    allowInventory: true,
    allowCustomLogo: true,
    allowCustomerDatabase: true,
    allowWhiteLabel: true,
    allowAdvancedReporting: true,
    allowLiveChat: true,
    maxUsers: 20,
    templateCategories: ['STANDARD', 'PREMIUM', 'ELITE']
  }
};

const TEMPLATE_PRICING = {
  STANDARD: 0,
  PREMIUM: 3500,
  ELITE: 8500
};

const TEMPLATE_BUNDLE_IDS = {
  PREMIUM: 'bundle_premium_templates',
  ELITE: 'bundle_elite_templates',
  ALL: 'bundle_all_templates'
};
const TEMPLATE_BUNDLE_PRICING = {
  PREMIUM: 10000,
  ELITE: 25000
};
const TEMPLATE_BUNDLE_ID = TEMPLATE_BUNDLE_IDS.ALL;
const TEMPLATE_BUNDLE_PRICE = TEMPLATE_BUNDLE_PRICING.PREMIUM + TEMPLATE_BUNDLE_PRICING.ELITE;
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

const normalizeBundleTier = (tier) => {
  const value = String(tier || 'premium').trim().toUpperCase();
  if (value === 'PREMIUM' || value === 'ELITE' || value === 'ALL') {
    return value;
  }
  return 'PREMIUM';
};

const getBundleTemplateId = (tier) => {
  const normalizedTier = normalizeBundleTier(tier);
  if (normalizedTier === 'ELITE') return TEMPLATE_BUNDLE_IDS.ELITE;
  if (normalizedTier === 'ALL') return TEMPLATE_BUNDLE_IDS.ALL;
  return TEMPLATE_BUNDLE_IDS.PREMIUM;
};

const getTemplateBundlePrice = (tier) => {
  const normalizedTier = normalizeBundleTier(tier);
  if (normalizedTier === 'ELITE') return TEMPLATE_BUNDLE_PRICING.ELITE;
  if (normalizedTier === 'ALL') return TEMPLATE_BUNDLE_PRICE;
  return TEMPLATE_BUNDLE_PRICING.PREMIUM;
};

const getPlanDefinition = (plan) => PLAN_DEFINITIONS[normalizePlanId(plan)] || PLAN_DEFINITIONS.starter;

const getDefaultTemplatePrice = (category) => TEMPLATE_PRICING[normalizeTemplateCategory(category)] || 0;

const getTemplatePrice = (template) => {
  const category = normalizeTemplateCategory(template?.category);
  const id = String(template?.id || template?.templateStyle || '').trim().toLowerCase();
  const isFree = Boolean(template?.isFree) || FREE_TEMPLATE_IDS.has(id);
  if (isFree || category === 'CUSTOM') {
    return 0;
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
  TEMPLATE_BUNDLE_IDS,
  TEMPLATE_BUNDLE_PRICING,
  TEMPLATE_BUNDLE_PRICE,
  TEMPLATE_BUNDLE_ID,
  FREE_TEMPLATE_IDS,
  normalizePlanId,
  normalizeTemplateCategory,
  normalizeBundleTier,
  getBundleTemplateId,
  getTemplateBundlePrice,
  getPlanDefinition,
  getDefaultTemplatePrice,
  getTemplatePrice,
  isTemplateIncludedInPlan,
  resolveRequiredPlanForTemplate
};
