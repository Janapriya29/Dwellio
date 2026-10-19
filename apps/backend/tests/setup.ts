import mongoose from 'mongoose';

const BASE_MONGO_URI = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017';

export const connectTestDb = async (dbName: string = 'dwellio_test'): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  const uri = `${BASE_MONGO_URI}/${dbName}`;
  await mongoose.connect(uri);
};

export const clearTestDb = async (): Promise<void> => {
  if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
    const collections = await mongoose.connection.db.collections();
    for (const collection of collections) {
      await collection.deleteMany({});
    }
  }
};

export const disconnectTestDb = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    if (mongoose.connection.db) {
      await mongoose.connection.db.dropDatabase();
    }
    await mongoose.connection.close();
  }
};
