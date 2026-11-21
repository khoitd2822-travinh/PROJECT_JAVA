package com.swiftletcare.backend.modules.auth.repository;

import com.swiftletcare.backend.modules.auth.entity.ERole;
import com.swiftletcare.backend.modules.auth.entity.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface RoleRepository extends JpaRepository<Role, Integer> {
    Optional<Role> findByName(ERole name);
}