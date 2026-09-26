import { db } from './index.js';
import { categoryGroups, categories } from './schema.js';
import { nanoid } from 'nanoid';

type BudgetType = 'fixed' | 'flexible' | 'non_monthly';

const defaultGroups: {
  name: string;
  isIncome: number;
  categories: { name: string; icon: string; budgetType?: BudgetType }[];
}[] = [
  {
    name: 'Income',
    isIncome: 1,
    categories: [
      { name: 'Paychecks', icon: '💵' },
      { name: 'Interest', icon: '💹' },
      { name: 'Business Income', icon: '💼' },
      { name: 'Other Income', icon: '💰' },
    ],
  },
  {
    name: 'Gifts & Donations',
    isIncome: 0,
    categories: [
      { name: 'Charity', icon: '❤️', budgetType: 'flexible' },
      { name: 'Gifts', icon: '🎁', budgetType: 'flexible' },
      { name: 'Donations', icon: '🤝', budgetType: 'flexible' },
    ],
  },
  {
    name: 'Transportation',
    isIncome: 0,
    categories: [
      { name: 'Gas / Fuel', icon: '⛽', budgetType: 'flexible' },
      { name: 'Car Payment', icon: '🚗', budgetType: 'fixed' },
      { name: 'Car Insurance', icon: '🛡️', budgetType: 'fixed' },
      { name: 'Parking', icon: '🅿️', budgetType: 'flexible' },
      { name: 'Public Transit', icon: '🚌', budgetType: 'flexible' },
      { name: 'Ride Share', icon: '🚕', budgetType: 'flexible' },
      { name: 'Car Maintenance', icon: '🔧', budgetType: 'non_monthly' },
    ],
  },
  {
    name: 'Housing',
    isIncome: 0,
    categories: [
      { name: 'Rent / Mortgage', icon: '🏠', budgetType: 'fixed' },
      { name: 'Home Insurance', icon: '🛡️', budgetType: 'fixed' },
      { name: 'Property Tax', icon: '🏛️', budgetType: 'fixed' },
      { name: 'HOA Fees', icon: '🏢', budgetType: 'fixed' },
      { name: 'Home Maintenance', icon: '🔨', budgetType: 'flexible' },
      { name: 'Home Improvement', icon: '🎨', budgetType: 'non_monthly' },
    ],
  },
  {
    name: 'Bills & Utilities',
    isIncome: 0,
    categories: [
      { name: 'Electric', icon: '⚡', budgetType: 'fixed' },
      { name: 'Water', icon: '💧', budgetType: 'fixed' },
      { name: 'Gas (Natural)', icon: '🔥', budgetType: 'fixed' },
      { name: 'Internet', icon: '🌐', budgetType: 'fixed' },
      { name: 'Phone', icon: '📱', budgetType: 'fixed' },
      { name: 'Trash / Recycling', icon: '♻️', budgetType: 'fixed' },
      { name: 'Streaming Services', icon: '📺', budgetType: 'fixed' },
    ],
  },
  {
    name: 'Food & Dining',
    isIncome: 0,
    categories: [
      { name: 'Groceries', icon: '🛒', budgetType: 'flexible' },
      { name: 'Restaurants', icon: '🍽️', budgetType: 'flexible' },
      { name: 'Coffee Shops', icon: '☕', budgetType: 'flexible' },
      { name: 'Fast Food', icon: '🍔', budgetType: 'flexible' },
      { name: 'Alcohol / Bars', icon: '🍷', budgetType: 'flexible' },
    ],
  },
  {
    name: 'Travel & Lifestyle',
    isIncome: 0,
    categories: [
      { name: 'Flights', icon: '✈️', budgetType: 'non_monthly' },
      { name: 'Hotels', icon: '🏨', budgetType: 'non_monthly' },
      { name: 'Vacation', icon: '🏖️', budgetType: 'non_monthly' },
      { name: 'Entertainment', icon: '🎬', budgetType: 'non_monthly' },
      { name: 'Hobbies', icon: '🎨', budgetType: 'non_monthly' },
    ],
  },
  {
    name: 'Shopping',
    isIncome: 0,
    categories: [
      { name: 'Clothing', icon: '👔', budgetType: 'flexible' },
      { name: 'Electronics', icon: '💻', budgetType: 'flexible' },
      { name: 'Home Goods', icon: '🛋️', budgetType: 'flexible' },
      { name: 'Personal Care', icon: '✨', budgetType: 'flexible' },
    ],
  },
  {
    name: 'Family',
    isIncome: 0,
    categories: [
      { name: 'Childcare / Daycare', icon: '👶', budgetType: 'fixed' },
      { name: 'Kids Activities', icon: '🎪', budgetType: 'flexible' },
      { name: 'School Supplies', icon: '🎒', budgetType: 'flexible' },
      { name: 'Baby Supplies', icon: '🍼', budgetType: 'flexible' },
      { name: 'Allowance', icon: '🐷', budgetType: 'flexible' },
    ],
  },
  {
    name: 'Education',
    isIncome: 0,
    categories: [
      { name: 'Tuition', icon: '🎓', budgetType: 'fixed' },
      { name: 'Books & Supplies', icon: '📚', budgetType: 'non_monthly' },
      { name: 'Student Loans', icon: '📜', budgetType: 'fixed' },
      { name: 'Online Courses', icon: '💻', budgetType: 'non_monthly' },
    ],
  },
  {
    name: 'Health & Wellness',
    isIncome: 0,
    categories: [
      { name: 'Doctor / Medical', icon: '🩺', budgetType: 'non_monthly' },
      { name: 'Dentist', icon: '🦷', budgetType: 'non_monthly' },
      { name: 'Pharmacy', icon: '💊', budgetType: 'flexible' },
      { name: 'Gym / Fitness', icon: '🏋️', budgetType: 'flexible' },
      { name: 'Mental Health', icon: '🧠', budgetType: 'non_monthly' },
      { name: 'Vision / Eye Care', icon: '👓', budgetType: 'non_monthly' },
    ],
  },
  {
    name: 'Financial',
    isIncome: 0,
    categories: [
      { name: 'Savings', icon: '🐷', budgetType: 'non_monthly' },
      { name: 'Investments', icon: '📈', budgetType: 'non_monthly' },
      { name: 'Loan Payment', icon: '🏦', budgetType: 'fixed' },
      { name: 'Bank Fees', icon: '💸', budgetType: 'fixed' },
    ],
  },
  {
    name: 'Business',
    isIncome: 0,
    categories: [
      { name: 'Office Supplies', icon: '📎', budgetType: 'flexible' },
      { name: 'Software / Tools', icon: '⚙️', budgetType: 'flexible' },
      { name: 'Marketing', icon: '📣', budgetType: 'flexible' },
      { name: 'Professional Services', icon: '💼', budgetType: 'flexible' },
      { name: 'Business Travel', icon: '🧳', budgetType: 'non_monthly' },
    ],
  },
  {
    name: 'Other',
    isIncome: 0,
    categories: [
      { name: 'Miscellaneous', icon: '📁', budgetType: 'flexible' },
      { name: 'Cash / ATM', icon: '💵', budgetType: 'flexible' },
      { name: 'Uncategorized', icon: '❓', budgetType: 'flexible' },
    ],
  },
];

const existingGroups = db.select().from(categoryGroups).all();
if (existingGroups.length > 0) {
  console.log('Database already seeded, skipping.');
  process.exit(0);
}

defaultGroups.forEach((group, groupIdx) => {
  const groupId = nanoid();
  db.insert(categoryGroups)
    .values({
      id: groupId,
      name: group.name,
      isIncome: group.isIncome,
      sortOrder: groupIdx,
      createdAt: new Date().toISOString(),
    })
    .run();

  group.categories.forEach((cat, catIdx) => {
    db.insert(categories)
      .values({
        id: nanoid(),
        groupId,
        name: cat.name,
        icon: cat.icon,
        budgetType: cat.budgetType ?? null,
        sortOrder: catIdx,
        createdAt: new Date().toISOString(),
      })
      .run();
  });
});

console.log('Seeded default categories.');
