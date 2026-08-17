import { Schema, model, InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    googleSub: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true },
    name: { type: String, required: true },
    picture: { type: String },
  },
  { timestamps: true },
);

export type UserDocument = InferSchemaType<typeof userSchema>;

export const UserModel = model('User', userSchema);
