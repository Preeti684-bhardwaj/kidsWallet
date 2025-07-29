const models = require('../Modals/index');

/**
 * Helper function to create a transaction with proper totalEarned and coinBalance calculation
 */
const createTransactionWithBalance = async (transactionData, transaction = null) => {
  const { childId, amount, type } = transactionData;

  // Get the last transaction for this child to get current totals
  const lastTransaction = await models.Transaction.findOne({
    where: { childId },
    order: [['createdAt', 'DESC']],
    transaction
  });

  const currentTotalEarned = lastTransaction ? lastTransaction.totalEarned : 0;
  const currentCoinBalance = lastTransaction ? lastTransaction.coinBalance : 0;

  // Calculate new totals based on transaction type
  let newTotalEarned = currentTotalEarned;
  let newCoinBalance = currentCoinBalance;

  // Types that increase earnings and balance
  const earningTypes = ['task_reward', 'streak_bonus', 'credit', 'blog_reward', 'quiz_reward'];
  
  // Types that only decrease balance (spending/investment)
  const spendingTypes = ['spending', 'investment'];

  if (earningTypes.includes(type)) {
    // For earning types: increase both totalEarned and coinBalance
    newTotalEarned = currentTotalEarned + amount;
    newCoinBalance = currentCoinBalance + amount;
  } else if (spendingTypes.includes(type)) {
    // For spending types: only decrease coinBalance, totalEarned stays same
    newTotalEarned = currentTotalEarned; // No change
    newCoinBalance = currentCoinBalance - Math.abs(amount); // Subtract amount
    
    // Ensure balance doesn't go negative
    if (newCoinBalance < 0) {
      throw new Error('Insufficient coin balance for this transaction');
    }
  }

  // Create the transaction with calculated totals
  const newTransaction = await models.Transaction.create({
    ...transactionData,
    totalEarned: newTotalEarned,
    coinBalance: newCoinBalance
  }, { transaction });

  return newTransaction;
};

/**
 * Get current coin balance and total earned for a child
 */
const getChildCoinStats = async (childId) => {
  const lastTransaction = await models.Transaction.findOne({
    where: { childId },
    order: [['createdAt', 'DESC']],
    attributes: ['totalEarned', 'coinBalance']
  });

  return {
    totalEarned: lastTransaction ? lastTransaction.totalEarned : 0,
    coinBalance: lastTransaction ? lastTransaction.coinBalance : 0
  };
};

/**
 * Sync child's coinBalance in Child model with latest transaction
 * (Optional: if you want to keep Child.coinBalance in sync)
 */
const syncChildCoinBalance = async (childId, transaction = null) => {
  const stats = await getChildCoinStats(childId);
  
  await models.Child.update(
    { coinBalance: stats.coinBalance },
    { 
      where: { id: childId },
      transaction 
    }
  );

  return stats;
};

module.exports = {
  createTransactionWithBalance,
  getChildCoinStats,
  syncChildCoinBalance
};