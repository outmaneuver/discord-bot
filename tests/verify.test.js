import { verifyHolder } from '../services/verify.js';
import { expect } from 'chai';

describe('Verify Service', () => {
  it('should verify valid wallet', async () => {
    const result = await verifyHolder('valid-wallet-address');
    expect(result.success).to.be.true;
  });

  it('should handle invalid wallet', async () => {
    try {
      await verifyHolder('invalid-wallet');
      expect.fail('Should have thrown error');
    } catch (error) {
      expect(error.message).to.include('Invalid wallet address');
    }
  });
}); 