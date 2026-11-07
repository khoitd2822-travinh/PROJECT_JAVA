package com.swiftletcare.backend.modules.storage.controller;

import com.swiftletcare.backend.modules.storage.service.MinioStorageService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/storage")
@CrossOrigin(origins = "*")
public class StorageController {
    private final MinioStorageService minioStorageService;
    public StorageController(MinioStorageService minioStorageService){
        this.minioStorageService = minioStorageService;
    }

    //api lay URL xem anh
    // vd:  http://localhost:8080/api/v1/storage/ abc.jpg
    @GetMapping("/url")
    public ResponseEntity<Map<String,Object>> getUrl(@RequestParam String fileName){
        String url = minioStorageService.getPresignedImageUrl(fileName);
        Map<String,Object> response = new HashMap<>();
        if (url != null){
            response.put("status",200);
            response.put("message","Tao URL thanh cong");
            response.put("url:",url);
            return ResponseEntity.ok(response);
        }else {
            response.put("status",500);
            response.put("message","Khong the tao URL cho file nay");
            return ResponseEntity.status(500).body(response);
        }
    }
}
