import { S3 } from "@aws-sdk/client-s3";
import crypto from "crypto";
import sharp from "sharp";

export class StorageService {

    /**
     * 
     * @param {string} accessId 
     * @param {string} accessKey 
     * @param {string} param2 
     */
    constructor(accessId, accessKey, { avatars }) {
        this.storage = new S3({
            credentials: {
                accessKeyId: accessId,
                secretAccessKey: accessKey
            }
        });
        
        this.avatarsBucketName = avatars
    }

    /**
     * 
     * @param {Express.Multer.File} file 
     */
    async saveAvatar(file) {
        const fileHash = crypto.createHash("sha256").update(file.buffer).digest("hex");

        let withoutMetadata = await sharp(file.buffer).withMetadata(false).toBuffer();

        const response = await this.storage.putObject({
            Bucket: this.avatarsBucketName,
            Key: fileHash,
            Body: withoutMetadata,
            ContentType: file.mimetype
        });

        return [response, fileHash];
    }

    /**
     * 
     * @param {string} fileHash 
     */
    async getAvatar(fileHash) {
        const response = await this.storage.getObject({
            Bucket: this.avatarsBucketName,
            Key: fileHash
        });

        return response.Body ? response : null;
    }

    /**
     * 
     * @param {string} filehash 
     */
    async deleteAvatar(fileHash) {
        await this.storage.deleteObject({
            Bucket: this.avatarsBucketName,
            Key: fileHash
        });
    }

}