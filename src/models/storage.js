import aws from "@aws-sdk/client-s3";
import multer from "multer";

export class StorageService {

    /**
     * 
     * @param {Object} configuration 
     */
    constructor(configuration) {
        this.configuration = configuration
        this.client = new aws.S3Client(configuration);
    }

    /**
     * 
     * @param {aws.$Command} command 
     * @returns 
     */
    async executeCommand(command) {
        return await this.client.send(command);
    }

    /**
     * 
     * @param {Express.Multer.File} file 
     */
    async saveAvatar(file) {
        const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

        const command = aws.PutObjectCommand({
            Bucket: "avatar", 
            Key: fileHash + ".jpg",
            Body: file.buffer,
            ContentType: file.mimetype
        });

        return await this.executeCommand(command), fileHash;
    }

    /**
     * 
     * @param {string} fileHash 
     * @returns {import("@aws-sdk/client-s3").GetObjectCommandOutput}
     */
    async getAvatar(fileHash) {
        const command = aws.GetObjectCommand({
            Bucket: "avatar", 
            Key: fileHash
        });

        let file = null;

        await this.executeCommand(command).then(response => {
            file = response.Body;    
        });

        return file;
    }

}