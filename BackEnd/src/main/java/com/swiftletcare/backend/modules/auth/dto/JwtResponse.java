package com.swiftletcare.backend.modules.auth.dto;
import lombok.AllArgsConstructor;
import lombok.Data;
import java.util.List;
@Data
@AllArgsConstructor
public class JwtResponse {
    private String token;
    private Long id;
    private String fullName;
    private String email;
    private List<String> roles;
}