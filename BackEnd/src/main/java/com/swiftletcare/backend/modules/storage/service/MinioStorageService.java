package com.swiftletcare.backend.modules.storage.service;

import io.minio.BucketExistsArgs;
import io.minio.GetPresignedObjectUrlArgs;
import io.minio.MakeBucketArgs;
import io.minio.MinioClient;
import io.minio.errors.MinioException;
import io.minio.http.Method;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.util.concurrent.TimeUnit;

@Service
public class MinioStorageService {
    private static final Logger log = LoggerFactory.getLogger(MinioStorageService.class);
    @Value("${s3.bucket-name}")
    private String bucketName;

    @Value("${s3.public-endpoint:}")
    private String publicEndpoint;

    private final MinioClient minioClient;
    private final MinioClient publicMinioClient;

    public MinioStorageService(@Qualifier("minioClient") MinioClient minioClient,
                               @Qualifier("publicMinioClient") MinioClient publicMinioClient) {
        this.minioClient = minioClient;
        this.publicMinioClient = publicMinioClient;
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
        } catch (MinioException | GeneralSecurityException | IOException | IllegalArgumentException exception) {
            log.warn("⚠️ Không thể kiểm tra/tạo Bucket S3 [{}]", bucketName, exception);
        }
        if (publicEndpoint.isBlank()) {
            log.warn("S3_PUBLIC_ENDPOINT is not configured; generated image URLs use the internal S3 endpoint and may not be reachable by Telegram");
        }
    }
    //tao ra cai URL de xem anh tu MinIO ( link nay co han khoang 1 tieng)
    public String getPresignedImageUrl(String objectName){
        try {
            return publicMinioClient.getPresignedObjectUrl(GetPresignedObjectUrlArgs.builder()
                            .method(Method.GET)
                            .bucket(bucketName)
                            .object(objectName)
                            .expiry(1, TimeUnit.HOURS)
                            .build());
        } catch (MinioException | GeneralSecurityException | IOException | IllegalArgumentException exception) {
            log.error("Không thể tạo URL cho ảnh [{}]", objectName, exception);
            return null;
        }
    }
}
