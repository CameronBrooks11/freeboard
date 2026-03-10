import type Policy from "../../../models/Policy.js";
import type { PolicyRepository } from "../../contracts.js";

export const createMongoPolicyRepository = (PolicyModel: typeof Policy): PolicyRepository => ({
  readValue: async ({ key }) => {
    const record = await PolicyModel.findOne({ key }).lean();
    return record?.value;
  },

  writeValue: async ({ key, value, updatedBy = null }) => {
    await PolicyModel.findOneAndUpdate(
      { key },
      {
        $set: {
          value,
          updatedBy,
        },
      },
      {
        upsert: true,
        new: false,
        setDefaultsOnInsert: true,
      },
    ).lean();
  },
});
