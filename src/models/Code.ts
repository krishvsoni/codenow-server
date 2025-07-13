import mongoose, { Document, Schema } from 'mongoose';

export interface ICode extends Document {
  id: string;
  code: string;
  url?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CodeSchema: Schema = new Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  code: {
    type: String,
    required: true
  },
  url: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
CodeSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export const Code = mongoose.model<ICode>('Code', CodeSchema);
