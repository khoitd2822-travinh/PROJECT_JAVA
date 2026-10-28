package com.swiftletcare.backend.modules.storage.service;

import io.minio.BucketExistsArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.http.Method;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

@Service
public class MinioStorageService {
    private static final Logger log = LoggerFactory.getLogger(MinioStorageService.class);
    @Value("${s3.bucket-name}")
    private String bucketName;

    private final MinioClient minioClient;
    public MinioStorageService(MinioClient minioClient){
        this.minioClient = minioClient;
    }

    //Tự động tạo Bucket swiftlet-alerts nếu chưa có sẵn lúc Spring Boot bật
    @PostConstruct
    public void initBucket() {
        try {
            boolean found = minioClient.bucketExists(BucketExistsArgs.builder().bucket(bucketName).build());
            if (!found) {
                minioClient.makeBucket(MakeBucketArgs.builder().bucket(bucketName).build());
                log.info("✅ [S3 Storage] Đã tự động khởi tạo Bucket: [{}]", bucketName);
            }
        } catch (Exception e) {
            log.warn("⚠️ Không thể kiểm tra/tạo Bucket S3 [{}]: {}", bucketName, e.getMessage());
        }
    }
    //tao ra cai URL de xem anh tu MinIO ( link nay co han khoang 1 tieng)
    public String getPresignedImageUrl(String objectName){
        try {
            return minioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                            .method(Method.GET)
                            .bucket(bucketName)
                            .object(objectName)
                            .expiry(1, TimeUnit.HOURS)
                            .build());
        }catch (Exception e){
            log.error("loi khi tao URL cho anh [{}]: {}", objectName, e.getMessage() );
            return null;
        }
    }
}
