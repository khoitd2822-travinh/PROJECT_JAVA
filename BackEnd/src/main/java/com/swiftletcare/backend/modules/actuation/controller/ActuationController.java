package com.swiftletcare.backend.modules.actuation.controller;

import com.swiftletcare.backend.modules.actuation.dto.OverrideRequestDTO;
import com.swiftletcare.backend.modules.actuation.service.ActuationService;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

@RestController
@RequestMapping("/api/v1/actuation")
@CrossOrigin(origins = "*")
public class ActuationController {
    private final ActuationService actuationService;
    public ActuationController(ActuationService actuationService){
        this.actuationService = actuationService;
    }
    // dieu khien ngat relay thu cong
    // http://localhost:8080/api/v1/actuation/override
    @PostMapping("/override")
    public ResponseEntity<Map<String,Object>> overrideActuator(@RequestBody OverrideRequestDTO request){
        boolean success = actuationService.sendOverrideCommand(request);
        Map<String,Object> response = new HashMap<>();
        if (success){
            response.put("status", 200);
            response.put("message","da gui lenh dieu khien thiet bi thanh cong");
            return ResponseEntity.ok(response);
        }else {
            response.put("status",500);
            response.put("message", "gui lenh dieu khien that bai");
            return ResponseEntity.status(500).body(response);

        }
    }
}
