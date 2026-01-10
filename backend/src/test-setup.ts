// Jest setup file - runs before all tests
import "dotenv/config";

// Suppress console logs during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
// };

beforeAll(() => {
  console.log("🧪 Test suite starting...");
});

afterAll(() => {
  console.log("✅ Test suite complete");
});
