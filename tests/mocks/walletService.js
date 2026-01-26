/**
 * Mock wallet service for testing
 */
const mockWalletService = {
  addCredit: async (userId, amount, description, orderId) => {
    console.log(`✅ Mock: Wallet credited ₹${amount} to user ${userId}`);
    return {
      success: true,
      newBalance: 5000,
      transaction: {
        amount,
        type: 'credit',
        description,
        orderId
      }
    };
  },
  
  deductCredit: async (userId, amount, description, orderId) => {
    console.log(`✅ Mock: Wallet debited ₹${amount} from user ${userId}`);
    return {
      success: true,
      newBalance: 3000,
      transaction: {
        amount,
        type: 'debit',
        description,
        orderId
      }
    };
  }
};

module.exports = mockWalletService;
